import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contacts,
  engagementContacts,
  engagements,
  organizations,
  type EngagementStatus,
} from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { logoVersion } from "@/modules/organizations/queries";
import type { ENGAGEMENT_SORTS } from "./schema";

const ownedBy = (ownerId: string) => eq(engagements.ownerId, ownerId);

// Planned work leads, finished and dropped work comes last.
const STATUS_ORDER = sql`array_position(array['active','planned','paused','completed','cancelled'], ${engagements.status})`;
const SORT_BY = {
  title: sql`lower(${engagements.title})`,
  start: sql`${engagements.startDate}`,
  end: sql`${engagements.targetEndDate}`,
  status: STATUS_ORDER,
};

const listColumns = {
  id: engagements.id,
  title: engagements.title,
  status: engagements.status,
  valueMinor: engagements.valueMinor,
  currency: engagements.currency,
  startDate: engagements.startDate,
  targetEndDate: engagements.targetEndDate,
  organizationId: engagements.organizationId,
  organizationName: organizations.name,
  logoVersion,
};

export async function listEngagements(
  ownerId: string,
  options: {
    q?: string;
    status?: EngagementStatus;
    organizationId?: string;
    sort?: (typeof ENGAGEMENT_SORTS)[number];
    dir?: "asc" | "desc";
    offset?: number;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const q = options.q?.trim();
  const direction = options.dir === "desc" ? sql`desc` : sql`asc`;
  const matching = and(
    ownedBy(ownerId),
    options.status ? eq(engagements.status, options.status) : undefined,
    options.organizationId
      ? eq(engagements.organizationId, options.organizationId)
      : undefined,
    q
      ? sql`${engagements.title} ilike ${`%${q.replace(/[\\%_]/g, "\\$&")}%`}`
      : undefined,
  );

  const [rows, total] = await Promise.all([
    db
      .select(listColumns)
      .from(engagements)
      .innerJoin(organizations, eq(organizations.id, engagements.organizationId))
      .where(matching)
      // Rows without a date sort last either way; the title and id keep pages stable.
      .orderBy(
        sql`${SORT_BY[options.sort ?? "status"]} ${direction} nulls last`,
        sql`lower(${engagements.title})`,
        asc(engagements.id),
      )
      .limit(limit + 1)
      .offset(options.offset ?? 0),
    db.$count(engagements, matching),
  ]);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, total };
}

export type EngagementListRow = Awaited<
  ReturnType<typeof listEngagements>
>["rows"][number];

// A company's own, for its panel: at most 100, which no single client comes near.
export async function listCompanyEngagements(
  ownerId: string,
  organizationId: string,
) {
  return (
    await listEngagements(ownerId, { organizationId, limit: 100 })
  ).rows;
}

// The companies the list can be narrowed to: those with work, by name.
export async function listEngagementCompanies(ownerId: string) {
  return db
    .selectDistinct({ id: organizations.id, name: organizations.name })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.organizationId))
    .where(ownedBy(ownerId))
    .orderBy(organizations.name, organizations.id)
    .limit(100);
}

export const countCompanyEngagements =(ownerId: string, organizationId: string) =>
  db.$count(
    engagements,
    and(ownedBy(ownerId), eq(engagements.organizationId, organizationId)),
  );

export async function getEngagement(ownerId: string, id: string) {
  const [row] = await db
    .select({
      ...getTableColumns(engagements),
      organizationName: organizations.name,
      logoVersion,
    })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.organizationId))
    .where(and(ownedBy(ownerId), eq(engagements.id, id)));
  if (!row) return null;

  const people = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      role: engagementContacts.role,
      photoVersion,
    })
    .from(engagementContacts)
    .innerJoin(contacts, eq(contacts.id, engagementContacts.contactId))
    .where(eq(engagementContacts.engagementId, id))
    .orderBy(asc(engagementContacts.createdAt), asc(contacts.id));

  return { ...row, contacts: people };
}

export type Engagement = NonNullable<Awaited<ReturnType<typeof getEngagement>>>;
