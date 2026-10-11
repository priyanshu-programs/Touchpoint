import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { organizations } from "@/db/schema";
import { prefixTsQuery } from "@/lib/text-search";
import { organizationTagNames } from "@/modules/tags/queries";

export const countOrganizations = (ownerId: string) =>
  db.$count(
    organizations,
    and(eq(organizations.ownerId, ownerId), isNull(organizations.archivedAt)),
  );

export async function listOrganizations(
  ownerId: string,
  options: {
    q?: string;
    tagId?: string;
    archived?: boolean;
    after?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const tsQuery = options.q ? prefixTsQuery(options.q) : "";

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      domain: organizations.domain,
      status: organizations.status,
      city: organizations.city,
      country: organizations.country,
      // Written with literal table names: selected columns are emitted unqualified here,
      // and a bare "id" inside the subquery would mean contacts.id.
      contactCount: sql<number>`(
        select count(*)::int from contacts
        where contacts.organization_id = organizations.id and contacts.archived_at is null
      )`,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.ownerId, ownerId),
        options.archived
          ? isNotNull(organizations.archivedAt)
          : isNull(organizations.archivedAt),
        tsQuery
          ? sql`${organizations.search} @@ to_tsquery('simple', ${tsQuery})`
          : undefined,
        options.tagId
          ? sql`exists (
              select 1 from organization_tags
              where organization_tags.organization_id = ${organizations.id}
                and organization_tags.tag_id = ${options.tagId}
            )`
          : undefined,
        options.after
          ? sql`(lower(${organizations.name}), ${organizations.id}) > (
              select lower(name), id from organizations
              where id = ${options.after} and owner_id = ${ownerId}
            )`
          : undefined,
      ),
    )
    .orderBy(sql`lower(${organizations.name})`, asc(organizations.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    rows: page,
    nextAfter: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function getOrganization(ownerId: string, id: string) {
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)));
  if (!row) return null;
  return { ...row, tags: await organizationTagNames(db, ownerId, id) };
}

export async function findSimilarOrganizations(
  executor: Executor,
  ownerId: string,
  name: string,
) {
  return executor
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.ownerId, ownerId),
        isNull(organizations.archivedAt),
        sql`similarity(${organizations.name}, ${name}) >= 0.45`,
      ),
    )
    .orderBy(sql`similarity(${organizations.name}, ${name}) desc`)
    .limit(5);
}
