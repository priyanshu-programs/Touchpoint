import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import {
  contactEmails,
  contactLinks,
  contacts,
  organizations,
} from "@/db/schema";
import { likePrefix, prefixTsQuery } from "@/lib/text-search";
import { contactTagNames } from "@/modules/tags/queries";

// Changes whenever the picture does, so its address can be cached for good.
const photoVersion = sql<string | null>`(
  select left(contact_photos.sha256, 12) from contact_photos
  where contact_photos.contact_id = contacts.id
)`;

export const countContacts = (ownerId: string) =>
  db.$count(
    contacts,
    and(eq(contacts.ownerId, ownerId), isNull(contacts.archivedAt)),
  );

export async function listContacts(
  ownerId: string,
  options: {
    q?: string;
    tagId?: string;
    organizationId?: string;
    archived?: boolean;
    after?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const q = options.q?.trim();
  const tsQuery = q ? prefixTsQuery(q) : "";

  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      relationshipType: contacts.relationshipType,
      isPrimary: contacts.isPrimary,
      organizationId: contacts.organizationId,
      organizationName: organizations.name,
      primaryEmail: contactEmails.email,
      photoVersion,
    })
    .from(contacts)
    .leftJoin(organizations, eq(organizations.id, contacts.organizationId))
    .leftJoin(
      contactEmails,
      and(
        eq(contactEmails.contactId, contacts.id),
        eq(contactEmails.isPrimary, true),
      ),
    )
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        options.archived
          ? isNotNull(contacts.archivedAt)
          : isNull(contacts.archivedAt),
        options.organizationId
          ? eq(contacts.organizationId, options.organizationId)
          : undefined,
        q
          ? or(
              tsQuery
                ? sql`${contacts.search} @@ to_tsquery('simple', ${tsQuery})`
                : undefined,
              sql`exists (
                select 1 from contact_emails e
                where e.contact_id = ${contacts.id} and e.email like ${likePrefix(q)}
              )`,
            )
          : undefined,
        options.tagId
          ? sql`exists (
              select 1 from contact_tags
              where contact_tags.contact_id = ${contacts.id}
                and contact_tags.tag_id = ${options.tagId}
            )`
          : undefined,
        options.after
          ? sql`(lower(${contacts.fullName}), ${contacts.id}) > (
              select lower(full_name), id from contacts
              where id = ${options.after} and owner_id = ${ownerId}
            )`
          : undefined,
      ),
    )
    .orderBy(sql`lower(${contacts.fullName})`, asc(contacts.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    rows: page,
    nextAfter: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function getContact(ownerId: string, id: string) {
  const [row] = await db
    .select({
      contact: contacts,
      organizationName: organizations.name,
      photoVersion,
    })
    .from(contacts)
    .leftJoin(organizations, eq(organizations.id, contacts.organizationId))
    .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)));
  if (!row) return null;

  const [emails, links, tags] = await Promise.all([
    db
      .select({
        id: contactEmails.id,
        email: contactEmails.email,
        label: contactEmails.label,
        isPrimary: contactEmails.isPrimary,
      })
      .from(contactEmails)
      .where(
        and(eq(contactEmails.ownerId, ownerId), eq(contactEmails.contactId, id)),
      )
      .orderBy(desc(contactEmails.isPrimary), asc(contactEmails.createdAt)),
    db
      .select({
        id: contactLinks.id,
        kind: contactLinks.kind,
        url: contactLinks.url,
      })
      .from(contactLinks)
      .where(
        and(eq(contactLinks.ownerId, ownerId), eq(contactLinks.contactId, id)),
      )
      .orderBy(asc(contactLinks.createdAt)),
    contactTagNames(db, ownerId, id),
  ]);
  return {
    ...row.contact,
    organizationName: row.organizationName,
    photoVersion: row.photoVersion,
    emails,
    links,
    tags,
  };
}

// A weaker name match is enough to warn when the two people are at the same organization.
export async function findSimilarContacts(
  executor: Executor,
  ownerId: string,
  name: string,
  organizationId: string | null,
) {
  const threshold = organizationId
    ? sql`case when ${contacts.organizationId} = ${organizationId} then 0.4 else 0.6 end`
    : sql`0.6`;
  return executor
    .select({ id: contacts.id, name: contacts.fullName })
    .from(contacts)
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        isNull(contacts.archivedAt),
        sql`similarity(${contacts.fullName}, ${name}) >= ${threshold}`,
      ),
    )
    .orderBy(sql`similarity(${contacts.fullName}, ${name}) desc`)
    .limit(5);
}
