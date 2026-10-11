import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contacts,
  organizations,
  reminders,
  tasks,
  type TASK_ORIGINS,
} from "@/db/schema";
import {
  addDays,
  dateIn,
  daysBetween,
  fromLocalInput,
  toLocalInput,
} from "@/lib/time";
import { audit } from "@/modules/audit/service";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import { ownerTimezone } from "@/modules/settings/service";
import { buildRule, nextOccurrence, parseRule } from "./recurrence";
import type { TaskInput } from "./schema";

export const REMINDER_JOB = "reminder.send";

export type TaskResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "unknown_contact" | "unknown_organization" | "not_found";
    };

type TaskRow = typeof tasks.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;

const snapshot = (row: TaskRow) => ({
  title: row.title,
  notes: row.notes,
  status: row.status,
  priority: row.priority,
  dueOn: row.dueOn,
  dueAt: row.dueAt,
  recurrenceRule: row.recurrenceRule,
  contactId: row.contactId,
  organizationId: row.organizationId,
});

async function unknownLink(tx: Tx, ownerId: string, input: TaskInput) {
  if (input.contactId) {
    const [row] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.ownerId, ownerId), eq(contacts.id, input.contactId)),
      );
    if (!row) return "unknown_contact" as const;
  }
  if (input.organizationId) {
    const [row] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.ownerId, ownerId),
          eq(organizations.id, input.organizationId),
        ),
      );
    if (!row) return "unknown_organization" as const;
  }
  return null;
}

function columns(input: TaskInput, timezone: string) {
  const timed = input.dueDate && input.dueTime;
  return {
    title: input.title,
    notes: input.notes,
    priority: input.priority,
    dueOn: input.dueDate,
    dueAt: timed
      ? fromLocalInput(`${input.dueDate}T${input.dueTime}`, timezone)
      : null,
    recurrenceRule:
      input.repeat && input.dueDate
        ? buildRule(input.repeat, input.repeatEvery, input.dueDate)
        : null,
    contactId: input.contactId,
    organizationId: input.organizationId,
  };
}

async function lockTask(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
    .for("update");
  return row;
}

async function scheduleReminder(
  tx: Tx,
  ownerId: string,
  taskId: string,
  remindAt: Date,
) {
  const [row] = await tx
    .insert(reminders)
    .values({ ownerId, taskId, remindAt })
    .returning({ id: reminders.id });
  await enqueue(
    {
      kind: REMINDER_JOB,
      payload: { reminderId: row.id },
      runAt: remindAt,
      dedupeKey: `reminder:${row.id}`,
      ownerId,
    },
    tx,
  );
}

// The queued job stays; it does nothing once its reminder is no longer scheduled.
async function cancelReminders(tx: Tx, ownerId: string, taskId: string) {
  await tx
    .update(reminders)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(reminders.ownerId, ownerId),
        eq(reminders.taskId, taskId),
        eq(reminders.status, "scheduled"),
      ),
    );
}

async function setReminder(
  tx: Tx,
  ownerId: string,
  taskId: string,
  remindAt: Date | null,
) {
  const [current] = await tx
    .select({ remindAt: reminders.remindAt })
    .from(reminders)
    .where(
      and(
        eq(reminders.ownerId, ownerId),
        eq(reminders.taskId, taskId),
        eq(reminders.status, "scheduled"),
      ),
    );
  // Saving a task without touching its reminder must not reschedule it.
  if (current && remindAt && current.remindAt.getTime() === remindAt.getTime()) {
    return;
  }
  if (current) await cancelReminders(tx, ownerId, taskId);
  if (remindAt) await scheduleReminder(tx, ownerId, taskId, remindAt);
}

// Takes the caller's transaction so a follow-up task commits with the activity that asked
// for it. The caller has already checked that the linked records belong to the owner.
export async function insertTask(
  tx: Tx,
  ownerId: string,
  timezone: string,
  input: TaskInput,
  origin: (typeof TASK_ORIGINS)[number] = "manual",
) {
  const [row] = await tx
    .insert(tasks)
    .values({ ownerId, origin, ...columns(input, timezone) })
    .returning();
  if (input.remindAt) {
    await scheduleReminder(
      tx,
      ownerId,
      row.id,
      fromLocalInput(input.remindAt, timezone),
    );
  }
  await audit(tx, {
    ownerId,
    actor: "user",
    action: "task.create",
    entityType: "task",
    entityId: row.id,
    after: snapshot(row),
  });
  return row.id;
}

export async function createTask(
  ownerId: string,
  input: TaskInput,
): Promise<TaskResult> {
  return db.transaction(async (tx) => {
    const problem = await unknownLink(tx, ownerId, input);
    if (problem) return { ok: false, reason: problem };

    const timezone = await ownerTimezone(tx, ownerId);
    return { ok: true, id: await insertTask(tx, ownerId, timezone, input) };
  });
}

export async function updateTask(
  ownerId: string,
  id: string,
  input: TaskInput,
): Promise<TaskResult> {
  return db.transaction(async (tx) => {
    const before = await lockTask(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    const problem = await unknownLink(tx, ownerId, input);
    if (problem) return { ok: false, reason: problem };

    const timezone = await ownerTimezone(tx, ownerId);
    const [row] = await tx
      .update(tasks)
      .set(columns(input, timezone))
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
      .returning();
    if (row.status === "open") {
      await setReminder(
        tx,
        ownerId,
        id,
        input.remindAt ? fromLocalInput(input.remindAt, timezone) : null,
      );
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "task.update",
      entityType: "task",
      entityId: id,
      before: snapshot(before),
      after: snapshot(row),
    });
    return { ok: true, id };
  });
}

async function createNextOccurrence(
  tx: Tx,
  task: TaskRow,
  lastReminder: ReminderRow | undefined,
  timezone: string,
) {
  const rule = parseRule(task.recurrenceRule!);
  // Working in the owner's wall-clock time keeps "9:00 every Monday" at 9:00 across clock changes.
  const dueLocal = task.dueAt ? toLocalInput(task.dueAt, timezone) : null;
  const dueDate = task.dueOn!;
  const nextDate = nextOccurrence(dueDate, rule, dateIn(timezone));

  const [next] = await tx
    .insert(tasks)
    .values({
      ownerId: task.ownerId,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      origin: task.origin,
      recurrenceRule: task.recurrenceRule,
      contactId: task.contactId,
      organizationId: task.organizationId,
      dueOn: nextDate,
      dueAt: dueLocal
        ? fromLocalInput(`${nextDate}${dueLocal.slice(10)}`, timezone)
        : null,
    })
    .returning({ id: tasks.id });

  if (lastReminder) {
    const remindLocal = toLocalInput(lastReminder.remindAt, timezone);
    const offsetDays = daysBetween(dueDate, remindLocal.slice(0, 10));
    await scheduleReminder(
      tx,
      task.ownerId,
      next.id,
      fromLocalInput(
        `${addDays(nextDate, offsetDays)}${remindLocal.slice(10)}`,
        timezone,
      ),
    );
  }
  return next.id;
}

export async function completeTask(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, ownerId, id);
    if (!task || task.status !== "open") return null;

    await tx
      .update(tasks)
      .set({ status: "done", completedAt: new Date(), snoozedUntil: null })
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)));
    const [lastReminder] = await tx
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.ownerId, ownerId),
          eq(reminders.taskId, id),
          inArray(reminders.status, ["scheduled", "sent"]),
        ),
      )
      .orderBy(desc(reminders.createdAt))
      .limit(1);
    await cancelReminders(tx, ownerId, id);

    const nextId = task.recurrenceRule
      ? await createNextOccurrence(
          tx,
          task,
          lastReminder,
          await ownerTimezone(tx, ownerId),
        )
      : null;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "task.complete",
      entityType: "task",
      entityId: id,
      after: { nextTaskId: nextId },
    });
    return { nextId };
  });
}

export async function reopenTask(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      // A repeating task already continued in the one created when it was completed,
      // so the reopened task stands alone.
      .set({ status: "open", completedAt: null, recurrenceRule: null })
      .where(
        and(
          eq(tasks.ownerId, ownerId),
          eq(tasks.id, id),
          inArray(tasks.status, ["done", "cancelled"]),
        ),
      )
      .returning({ id: tasks.id });
    if (!row) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "task.reopen",
      entityType: "task",
      entityId: id,
    });
    return true;
  });
}

export async function cancelTask(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({ status: "cancelled", snoozedUntil: null })
      .where(
        and(
          eq(tasks.ownerId, ownerId),
          eq(tasks.id, id),
          eq(tasks.status, "open"),
        ),
      )
      .returning({ id: tasks.id });
    if (!row) return false;
    await cancelReminders(tx, ownerId, id);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "task.cancel",
      entityType: "task",
      entityId: id,
    });
    return true;
  });
}

// Hides the task from Today until the start of the day that many days ahead; null clears it.
export async function snoozeTask(
  ownerId: string,
  id: string,
  days: number | null,
) {
  return db.transaction(async (tx) => {
    const timezone = await ownerTimezone(tx, ownerId);
    const snoozedUntil =
      days === null
        ? null
        : fromLocalInput(`${addDays(dateIn(timezone), days)}T00:00`, timezone);
    const [row] = await tx
      .update(tasks)
      .set({ snoozedUntil })
      .where(
        and(
          eq(tasks.ownerId, ownerId),
          eq(tasks.id, id),
          eq(tasks.status, "open"),
        ),
      )
      .returning({ id: tasks.id });
    if (!row) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "task.snooze",
      entityType: "task",
      entityId: id,
      after: { snoozedUntil },
    });
    return true;
  });
}

export async function dismissReminder(ownerId: string, reminderId: string) {
  const [row] = await db
    .update(reminders)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(reminders.ownerId, ownerId),
        eq(reminders.id, reminderId),
        eq(reminders.status, "sent"),
      ),
    )
    .returning({ id: reminders.id });
  return Boolean(row);
}

// In-app delivery: a sent reminder is shown on Today until it is dismissed or its task is closed.
export async function sendReminder(job: ClaimedJob) {
  const { reminderId } = job.payload as { reminderId: string };
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: reminders.status, taskStatus: tasks.status })
      .from(reminders)
      .innerJoin(tasks, eq(tasks.id, reminders.taskId))
      .where(
        and(eq(reminders.ownerId, job.ownerId!), eq(reminders.id, reminderId)),
      )
      .for("update");
    if (!row || row.status !== "scheduled") return;
    await tx
      .update(reminders)
      .set(
        row.taskStatus === "open"
          ? { status: "sent", sentAt: new Date() }
          : { status: "cancelled" },
      )
      .where(eq(reminders.id, reminderId));
  });
}
