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
import { activities, organizations } from "@/db/schema";
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
export const logoVersion = sql<string | null>`(
  select left(organization_logos.sha256, 12) from organization_logos
  where organization_logos.organization_id = organizations.id
)`;

export const ORGANIZATION_SORTS = [
  "name",
  "domain",
  "industry",
  "contacts",
  "activity",
] as const;
const SORT_BY = {
  name: sql`lower(${organizations.name})`,
  domain: sql`${organizations.domain}`,
  industry: sql`lower(${organizations.industry})`,
  contacts: contactCount,
  activity: lastActivityAt,
};

export async function listOrganizations(
  ownerId: string,
  options: {
    q?: string;
    tagId?: string;
    status?: string;
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
  const matching = and(
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
  );

  const [rows, total] = await Promise.all([
    db
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
      .where(matching)
      // Companies without a value sort last either way; the name and id keep pages stable.
      .orderBy(
        sql`${SORT_BY[sort]} ${direction} nulls last`,
        sql`lower(${organizations.name})`,
        asc(organizations.id),
      )
      .limit(limit + 1)
      .offset(options.offset ?? 0),
    db.$count(organizations, matching),
  ]);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, total };
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

// What the other company brings, and whether a website read on either is under way.
async function carried(ownerId: string, keepId: string, otherId: string) {
  const result = await db.execute<{
    people: number;
    shared: number;
    activities: number;
    tasks: number;
    workflows: number;
    sends: number;
    reading: boolean;
  }>(sql`
    select
      (select count(*)::int from contact_organizations
        where owner_id = ${ownerId} and organization_id = ${otherId}) as people,
      (select count(*)::int from contact_organizations merged
        join contact_organizations kept on kept.contact_id = merged.contact_id
          and kept.organization_id = ${keepId}
        where merged.owner_id = ${ownerId} and merged.organization_id = ${otherId}) as shared,
      (select count(*)::int from activities
        where owner_id = ${ownerId} and organization_id = ${otherId}) as activities,
      (select count(*)::int from tasks
        where owner_id = ${ownerId} and organization_id = ${otherId}) as tasks,
      (select count(*)::int from workflow_boards
        where owner_id = ${ownerId} and organization_id = ${otherId}) as workflows,
      (select count(*)::int from material_sends
        where owner_id = ${ownerId} and organization_id = ${otherId}) as sends,
      exists (select 1 from enrichment_runs
        where owner_id = ${ownerId}
          and organization_id in (${keepId}, ${otherId})
          and status in ('queued', 'running')) as reading
  `);
  return result.rows[0];
}

// The two companies a merge would join, or nothing unless both are the owner's and apart.
export async function organizationMergePreview(
  ownerId: string,
  keepId: string,
  otherId: string,
) {
  if (keepId === otherId) return null;
  const [keep, other, brings] = await Promise.all([
    getOrganization(ownerId, keepId),
    getOrganization(ownerId, otherId),
    carried(ownerId, keepId, otherId),
  ]);
  return keep && other ? { keep, other, brings } : null;
}
