import {
  and,
  asc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import {
  activities,
  organizations,
  type ORGANIZATION_STATUSES,
} from "@/db/schema";
import { likePrefix, prefixTsQuery } from "@/lib/text-search";
import { organizationTagNames } from "@/modules/tags/queries";

export const countOrganizations = (ownerId: string) =>
  db.$count(
    organizations,
    and(eq(organizations.ownerId, ownerId), isNull(organizations.archivedAt)),
  );

// Written with literal table names: selected columns are emitted unqualified here,
// and a bare "id" inside a subquery would mean the inner table's id.
const contactCount = sql<number>`(
  select count(*)::int from contact_organizations
  join contacts on contacts.id = contact_organizations.contact_id
  where contact_organizations.organization_id = organizations.id
    and contacts.archived_at is null
)`;
const lastActivityAt = sql`(
  select max(activities.occurred_at) from activities
  where activities.organization_id = organizations.id
)`.mapWith(activities.occurredAt) as SQL<Date | null>;

// Changes whenever the logo does, so its address can be cached for good.
const logoVersion = sql<string | null>`(
  select left(organization_logos.sha256, 12) from organization_logos
  where organization_logos.organization_id = organizations.id
)`;

export const ORGANIZATION_SORTS =["name", "contacts", "activity"] as const;
const SORT_BY = {
  name: sql`lower(${organizations.name})`,
  contacts: contactCount,
  activity: lastActivityAt,
};

export async function listOrganizations(
  ownerId: string,
  options: {
    q?: string;
    tagId?: string;
    status?: (typeof ORGANIZATION_STATUSES)[number];
    archived?: boolean;
    sort?: (typeof ORGANIZATION_SORTS)[number];
    dir?: "asc" | "desc";
    offset?: number;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const q = options.q?.trim().toLowerCase();
  const tsQuery = q ? prefixTsQuery(q) : "";
  const sort =options.sort ?? "name";
  const direction = options.dir === "desc" ? sql`desc` : sql`asc`;

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      domain: organizations.domain,
      industry: organizations.industry,
      status: organizations.status,
      city: organizations.city,
      country: organizations.country,
      contactCount,
      lastActivityAt,
      logoVersion,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.ownerId, ownerId),
        options.archived
          ? isNotNull(organizations.archivedAt)
          : isNull(organizations.archivedAt),
        options.status ? eq(organizations.status, options.status) : undefined,
        // A whole domain is one search token ("acme.com"), which the word-prefix query cannot reach.
        q
          ? or(
              tsQuery
                ? sql`${organizations.search} @@ to_tsquery('simple', ${tsQuery})`
                : undefined,
              sql`${organizations.domain} like ${likePrefix(q)}`,
            )
          : undefined,
        options.tagId
          ? sql`exists (
              select 1 from organization_tags
              where organization_tags.organization_id = ${organizations.id}
                and organization_tags.tag_id = ${options.tagId}
            )`
          : undefined,
      ),
    )
    // Companies with no activity sort last either way; the name and id keep pages stable.
    .orderBy(
      sql`${SORT_BY[sort]} ${direction} nulls last`,
      sql`lower(${organizations.name})`,
      asc(organizations.id),
    )
    .limit(limit + 1)
    .offset(options.offset ?? 0);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getOrganization(ownerId: string, id: string) {
  const [row] = await db
    .select({ ...getTableColumns(organizations), logoVersion })
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
