import { and, asc, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contacts,
  materials,
  materialSends,
  materialVersions,
  organizations,
  tasks,
} from "@/db/schema";
import { addDays, dateIn, daysBetween, fromLocalInput } from "@/lib/time";
import type { DateRange } from "@/modules/revenue/period";
import { within } from "@/modules/revenue/queries";

const PAGE = 50;

type Paging = { offset?: number; limit?: number };
export type Zoned = { today: string; timezone: string };

// The period's dates as the instants they start and end at in the owner's zone, the end
// excluded, so no zone name reaches Postgres.
function instants(range: DateRange, timezone: string) {
  return {
    start: range.from ? fromLocalInput(`${range.from}T00:00`, timezone).toISOString() : null,
    end: range.to ? fromLocalInput(`${addDays(range.to, 1)}T00:00`, timezone).toISOString() : null,
  };
}

const rate = (part: number, whole: number) => (whole === 0 ? null : part / whole);

// Follow-ups due in the period whose day has come: every one due before today, and one
// due today once it is done, since it is not late yet.
const followUpsDue = (ownerId: string, range: DateRange, today: string) =>
  and(
    eq(tasks.ownerId, ownerId),
    eq(tasks.origin, "follow_up"),
    ne(tasks.status, "cancelled"),
    within(tasks.dueOn, range),
    or(lt(tasks.dueOn, today), and(eq(tasks.dueOn, today), eq(tasks.status, "done"))),
  );

export type FollowUpOutcome = { done: "on-time" } | { done: "late"; days: number } | { done: false };

// A follow-up is on time when it was done on or before its due date, read in the owner's zone.
function outcome(
  row: { dueOn: string | null; status: string; completedAt: Date | null },
  timezone: string,
): FollowUpOutcome {
  if (row.status !== "done" || !row.completedAt) return { done: false };
  const doneOn = dateIn(timezone, row.completedAt);
  return doneOn <= row.dueOn! ? { done: "on-time" } : { done: "late", days: daysBetween(row.dueOn!, doneOn) };
}

export async function followUpCompliance(ownerId: string, range: DateRange, options: Zoned) {
  const rows = await db
    .select({ dueOn: tasks.dueOn, status: tasks.status, completedAt: tasks.completedAt })
    .from(tasks)
    .where(followUpsDue(ownerId, range, options.today));
  const onTime = rows.filter((row) => outcome(row, options.timezone).done === "on-time").length;
  return { count: rows.length, onTime, rate: rate(onTime, rows.length) };
}

export async function followUpRows(ownerId: string, range: DateRange, options: Zoned & Paging) {
  const matching = followUpsDue(ownerId, range, options.today);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueOn: tasks.dueOn,
        status: tasks.status,
        completedAt: tasks.completedAt,
        contactId: tasks.contactId,
        contactName: contacts.fullName,
        organizationId: tasks.organizationId,
        organizationName: organizations.name,
      })
      .from(tasks)
      .leftJoin(contacts, eq(contacts.id, tasks.contactId))
      .leftJoin(organizations, eq(organizations.id, tasks.organizationId))
      .where(matching)
      .orderBy(desc(tasks.dueOn), asc(tasks.id))
      .limit(options.limit ?? PAGE)
      .offset(options.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(tasks).where(matching),
  ]);
  return {
    rows: rows.map(({ status, completedAt, ...row }) => ({
      ...row,
      dueOn: row.dueOn!,
      outcome: outcome({ dueOn: row.dueOn, status, completedAt }, options.timezone),
    })),
    total,
  };
}

// Each person an outbound activity in the period reached, with the first of them and the
// first inbound activity after it, at any time since: an inbound before it is no reply.
const reached = (ownerId: string, range: DateRange, timezone: string) => {
  const { start, end } = instants(range, timezone);
  return sql`
    with outbound as (
      select ac.contact_id, a.occurred_at, a.kind
      from activities a
      join activity_contacts ac on ac.activity_id = a.id
      where a.owner_id = ${ownerId} and ac.owner_id = ${ownerId} and a.direction = 'outbound'
        ${start ? sql`and a.occurred_at >= ${start}::timestamptz` : sql``}
        ${end ? sql`and a.occurred_at < ${end}::timestamptz` : sql``}
    ), first_out as (
      select distinct on (contact_id) contact_id, occurred_at, kind
      from outbound
      order by contact_id, occurred_at, kind
    )
    select f.contact_id, f.occurred_at as out_at, f.kind as out_kind, reply.occurred_at as reply_at, reply.kind as reply_kind
    from first_out f
    left join lateral (
      select a.occurred_at, a.kind
      from activities a
      join activity_contacts ac on ac.activity_id = a.id
      where a.owner_id = ${ownerId} and ac.owner_id = ${ownerId} and ac.contact_id = f.contact_id
        and a.direction = 'inbound'
        and a.occurred_at > f.occurred_at
      order by a.occurred_at
      limit 1
    ) reply on true
  `;
};

export async function replyRate(ownerId: string, range: DateRange, options: Zoned) {
  const result = await db.execute<{ count: number; replied: number }>(sql`
    select count(*)::int as count, count(reply_at)::int as replied
    from (${reached(ownerId, range, options.timezone)}) reached
  `);
  const { count, replied } = result.rows[0];
  return { count, replied, rate: rate(replied, count) };
}

export async function replyRows(ownerId: string, range: DateRange, options: Zoned & Paging) {
  const result = await db.execute<{
    contact_id: string;
    full_name: string;
    company: string | null;
    out_at: Date | string;
    out_kind: string;
    reply_at: Date | string | null;
    reply_kind: string | null;
    total: number;
  }>(sql`
    select r.contact_id, c.full_name, r.out_at, r.out_kind, r.reply_at, r.reply_kind,
      (select o.name from contact_organizations co
        join organizations o on o.id = co.organization_id
        where co.contact_id = r.contact_id
        order by co.is_primary desc, o.name limit 1) as company,
      count(*) over ()::int as total
    from (${reached(ownerId, range, options.timezone)}) r
    join contacts c on c.id = r.contact_id
    order by r.out_at desc, r.contact_id
    limit ${options.limit ?? PAGE} offset ${options.offset ?? 0}
  `);
  return {
    rows: result.rows.map((row) => ({
      contactId: row.contact_id,
      name: row.full_name,
      company: row.company,
      outAt: new Date(row.out_at),
      outKind: row.out_kind,
      replyAt: row.reply_at ? new Date(row.reply_at) : null,
      replyKind: row.reply_kind,
    })),
    total: result.rows[0]?.total ?? 0,
  };
}

// Sends of proposals made in the period.
const proposalSends = (ownerId: string, range: DateRange, timezone: string) => {
  const { start, end } = instants(range, timezone);
  return and(
    eq(materialSends.ownerId, ownerId),
    eq(materials.type, "proposal"),
    start ? sql`${materialSends.sentAt} >= ${start}::timestamptz` : undefined,
    end ? sql`${materialSends.sentAt} < ${end}::timestamptz` : undefined,
  );
};

// Accepted ÷ (accepted + rejected) over the proposals sent in the period. One still sent
// or viewed is waiting for an answer and one superseded was replaced by a newer version;
// neither counts either way.
export async function proposalAcceptance(ownerId: string, range: DateRange, options: Zoned) {
  const rows = await db
    .select({ status: materialSends.status, count: sql<number>`count(*)::int` })
    .from(materialSends)
    .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(proposalSends(ownerId, range, options.timezone))
    .groupBy(materialSends.status);
  const of = (...statuses: string[]) =>
    rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const accepted = of("accepted");
  const answered = accepted + of("rejected");
  return {
    accepted,
    answered,
    waiting: of("sent", "viewed"),
    superseded: of("superseded"),
    rate: rate(accepted, answered),
  };
}

export async function proposalRows(ownerId: string, range: DateRange, options: Zoned & Paging) {
  const matching = proposalSends(ownerId, range, options.timezone);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: materialSends.id,
        materialId: materials.id,
        material: materials.name,
        version: materialVersions.label,
        sentAt: materialSends.sentAt,
        status: materialSends.status,
        organizationName: organizations.name,
        people: sql<string | null>`(
          select string_agg(c.full_name, ', ' order by c.full_name)
          from material_send_recipients r
          join contacts c on c.id = r.contact_id
          where r.send_id = ${materialSends.id}
        )`,
      })
      .from(materialSends)
      .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
      .innerJoin(materials, eq(materials.id, materialVersions.materialId))
      .leftJoin(organizations, eq(organizations.id, materialSends.organizationId))
      .where(matching)
      .orderBy(desc(materialSends.sentAt), asc(materialSends.id))
      .limit(options.limit ?? PAGE)
      .offset(options.offset ?? 0),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(materialSends)
      .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
      .innerJoin(materials, eq(materials.id, materialVersions.materialId))
      .where(matching),
  ]);
  return { rows, total };
}
