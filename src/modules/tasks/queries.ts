import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, organizations, reminders, tasks } from "@/db/schema";
import type { TASK_STATUSES } from "./schema";

const columns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  dueOn: tasks.dueOn,
  dueAt: tasks.dueAt,
  snoozedUntil: tasks.snoozedUntil,
  completedAt: tasks.completedAt,
  recurrenceRule: tasks.recurrenceRule,
  contactId: tasks.contactId,
  contactName: contacts.fullName,
  organizationId: tasks.organizationId,
  organizationName: organizations.name,
};

const withLinks = () =>
  db
    .select(columns)
    .from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.contactId))
    .leftJoin(organizations, eq(organizations.id, tasks.organizationId));

export type TaskListRow = Awaited<ReturnType<typeof withLinks>>[number];

// Soonest first: by calendar date, all-day tasks before timed ones on the same day,
// undated tasks last. Dates are the owner's own, so no time zone is involved here.
const dueOrder = [
  sql`coalesce(${tasks.dueOn}, 'infinity'::date)`,
  sql`coalesce(${tasks.dueAt}, '-infinity'::timestamptz)`,
];

// Open tasks due within a range of the owner's calendar dates. Overdue tasks are included
// when no start is given.
export async function listDueTasks(
  ownerId: string,
  range: { from?: string; through: string; hideSnoozed?: boolean },
) {
  return withLinks()
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        eq(tasks.status, "open"),
        lte(tasks.dueOn, range.through),
        range.from ? gte(tasks.dueOn, range.from) : undefined,
        range.hideSnoozed
          ? sql`(${tasks.snoozedUntil} is null or ${tasks.snoozedUntil} <= now())`
          : undefined,
      ),
    )
    .orderBy(...dueOrder, asc(tasks.createdAt))
    .limit(200);
}

export async function listTasks(
  ownerId: string,
  options: {
    status?: (typeof TASK_STATUSES)[number];
    contactId?: string;
    organizationId?: string;
    after?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const status = options.status ?? "open";
  // Open tasks read soonest first; finished ones read most recently closed first.
  const byDue = status === "open";
  const cursor = options.after
    ? byDue
      ? sql`(${dueOrder[0]}, ${dueOrder[1]}, ${tasks.id}) > (
          select coalesce(due_on, 'infinity'::date), coalesce(due_at, '-infinity'::timestamptz), id
          from tasks where id = ${options.after} and owner_id = ${ownerId}
        )`
      : sql`(${tasks.updatedAt}, ${tasks.id}) < (
          select updated_at, id from tasks
          where id = ${options.after} and owner_id = ${ownerId}
        )`
    : undefined;

  const rows = await withLinks()
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        eq(tasks.status, status),
        options.contactId ? eq(tasks.contactId, options.contactId) : undefined,
        options.organizationId
          ? eq(tasks.organizationId, options.organizationId)
          : undefined,
        cursor,
      ),
    )
    .orderBy(
      ...(byDue
        ? [...dueOrder, asc(tasks.id)]
        : [desc(tasks.updatedAt), desc(tasks.id)]),
    )
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    rows: page,
    nextAfter: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function getTask(ownerId: string, id: string) {
  const [row] = await db
    .select({
      task: tasks,
      contactName: contacts.fullName,
      organizationName: organizations.name,
    })
    .from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.contactId))
    .leftJoin(organizations, eq(organizations.id, tasks.organizationId))
    .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)));
  if (!row) return null;

  // The scheduled reminder if there is one, otherwise the last one that was sent.
  const [reminder] = await db
    .select({
      remindAt: reminders.remindAt,
      status: reminders.status,
      sentAt: reminders.sentAt,
    })
    .from(reminders)
    .where(
      and(
        eq(reminders.ownerId, ownerId),
        eq(reminders.taskId, id),
        inArray(reminders.status, ["scheduled", "sent"]),
      ),
    )
    .orderBy(
      sql`${reminders.status} = 'scheduled' desc`,
      desc(reminders.createdAt),
    )
    .limit(1);
  return {
    ...row.task,
    contactName: row.contactName,
    organizationName: row.organizationName,
    reminder: reminder ?? null,
  };
}

export async function listDeliveredReminders(ownerId: string) {
  return db
    .select({
      id: reminders.id,
      taskId: tasks.id,
      title: tasks.title,
      remindAt: reminders.remindAt,
    })
    .from(reminders)
    .innerJoin(tasks, eq(tasks.id, reminders.taskId))
    .where(
      and(
        eq(reminders.ownerId, ownerId),
        eq(reminders.status, "sent"),
        isNull(reminders.dismissedAt),
        eq(tasks.status, "open"),
      ),
    )
    .orderBy(desc(reminders.remindAt))
    .limit(50);
}
