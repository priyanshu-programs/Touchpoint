import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { jobs, reminders, tasks } from "@/db/schema";
import { addDays, dateIn, toLocalInput } from "@/lib/time";
import { listAudit } from "@/modules/audit/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { runDueJobs } from "@/modules/jobs/service";
import { handlers } from "@/modules/jobs/tick";
import { saveSettings } from "@/modules/settings/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  getTask,
  listDeliveredReminders,
  listDueTasks,
  listTasks,
} from "./queries";
import { taskInput } from "./schema";
import {
  cancelTask,
  completeTask,
  createTask,
  dismissReminder,
  reopenTask,
  snoozeTask,
  updateTask,
} from "./service";

const ZONE = "Asia/Kolkata";
const form = {
  title: "Call Priya",
  notes: "",
  priority: "normal",
  dueDate: "",
  dueTime: "",
  repeat: "",
  repeatEvery: "1",
  remindAt: "",
  contactId: "",
  organizationId: "",
};
const input = (override: Partial<typeof form> = {}) =>
  taskInput.parse({ ...form, ...override });

describe("taskInput", () => {
  it("accepts an undated, an all-day and a timed task", () => {
    expect(input()).toMatchObject({ dueDate: null, dueTime: null, repeat: null });
    expect(input({ dueDate: "2026-10-12" }).dueDate).toBe("2026-10-12");
    expect(input({ dueDate: "2026-10-12", dueTime: "09:30" }).dueTime).toBe(
      "09:30",
    );
    expect(input({ remindAt: "2026-10-12T09:00" }).remindAt).toBe(
      "2026-10-12T09:00",
    );
  });

  it.each([
    ["a missing title", { title: " " }],
    ["a date that does not exist", { dueDate: "2026-02-30" }],
    ["a time without a date", { dueTime: "09:30" }],
    ["a malformed time", { dueDate: "2026-10-12", dueTime: "25:00" }],
    ["a repeat without a date", { repeat: "WEEKLY" }],
    ["a repeat every zero", { dueDate: "2026-10-12", repeat: "DAILY", repeatEvery: "0" }],
    ["a reminder with an offset", { remindAt: "2026-10-12T09:00+05:30" }],
    ["an unknown priority", { priority: "urgent" }],
    ["an unexpected field", { status: "done" }],
  ])("rejects %s", (_label, override) => {
    expect(taskInput.safeParse({ ...form, ...override }).success).toBe(false);
  });
});

describe("tasks", () => {
  let ownerId: string;
  let today: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await saveSettings(ownerId, {
      baseCurrency: "INR",
      timezone: ZONE,
      weekStart: 1,
      fiscalYearStartMonth: 4,
    });
    today = dateIn(ZONE);
  });

  async function create(override: Partial<typeof form> = {}, owner = ownerId) {
    const result = await createTask(owner, input(override));
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  async function createPerson(owner = ownerId) {
    const result = await createContact(
      owner,
      newContactInput.parse({
        firstName: "Priya",
        lastName: "Sharma",
        email: "",
        organizationId: "",
        jobTitle: "",
        department: "",
        phoneE164: "",
        city: "",
        region: "",
        country: "",
        timezone: "",
        preferredChannel: "",
        status: "active",
        relationshipType: "prospect",
        tags: "",
      }),
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  const remindersOf = (taskId: string) =>
    db
      .select()
      .from(reminders)
      .where(eq(reminders.taskId, taskId))
      .orderBy(reminders.createdAt);

  it("stores the owner's date for every due task, and the instant too when it has a time", async () => {
    const allDay = await getTask(ownerId, await create({ dueDate: "2026-10-12" }));
    expect(allDay).toMatchObject({ dueOn: "2026-10-12", dueAt: null });

    const timed = await getTask(
      ownerId,
      await create({ dueDate: "2026-10-12", dueTime: "00:30" }),
    );
    // 00:30 on the 12th in Kolkata is still the 11th in UTC; the date kept is the owner's.
    expect(timed!.dueOn).toBe("2026-10-12");
    expect(timed!.dueAt!.toISOString()).toBe("2026-10-11T19:00:00.000Z");
  });

  it("moves a timed task to its new calendar date when the owner changes time zone", async () => {
    const timed = await create({ dueDate: "2026-10-12", dueTime: "00:30" });
    const allDay = await create({ dueDate: "2026-10-12" });
    const done = await create({ dueDate: "2026-10-12", dueTime: "00:30" });
    await completeTask(ownerId, done);

    await saveSettings(ownerId, {
      baseCurrency: "INR",
      timezone: "UTC",
      weekStart: 1,
      fiscalYearStartMonth: 4,
    });

    expect((await getTask(ownerId, timed))!.dueOn).toBe("2026-10-11");
    expect((await getTask(ownerId, allDay))!.dueOn).toBe("2026-10-12");
    // A closed task keeps the date it had.
    expect((await getTask(ownerId, done))!.dueOn).toBe("2026-10-12");
  });

  it("links a task to a contact and writes an audit row", async () => {
    const contactId = await createPerson();
    const id = await create({ contactId });

    expect(await getTask(ownerId, id)).toMatchObject({
      contactId,
      contactName: "Priya Sharma",
      origin: "manual",
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "task.create",
      entityId: id,
      after: { title: "Call Priya", contactId },
    });
  });

  it("refuses a link to a contact the owner does not have", async () => {
    const otherId = await createTestOwner("other@example.com");
    const theirContact = await createPerson(otherId);

    expect(await createTask(ownerId, input({ contactId: theirContact }))).toEqual({
      ok: false,
      reason: "unknown_contact",
    });
  });

  it("updates a task and records before and after", async () => {
    const id = await create();

    const result = await updateTask(
      ownerId,
      id,
      input({ title: "Email Priya", priority: "high", dueDate: "2026-10-20" }),
    );

    expect(result).toEqual({ ok: true, id });
    expect(await getTask(ownerId, id)).toMatchObject({
      title: "Email Priya",
      priority: "high",
      dueOn: "2026-10-20",
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "task.update",
      before: { title: "Call Priya", dueOn: null },
      after: { title: "Email Priya", dueOn: "2026-10-20" },
    });
  });

  it("schedules a reminder together with its job, and reschedules only on change", async () => {
    const id = await create({ remindAt: "2030-01-01T09:00" });

    let rows = await remindersOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "scheduled", channel: "in_app" });
    expect(rows[0].remindAt.toISOString()).toBe("2030-01-01T03:30:00.000Z");
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.dedupeKey, `reminder:${rows[0].id}`));
    expect(job).toMatchObject({ kind: "reminder.send", status: "pending", ownerId });
    expect(job.runAt.toISOString()).toBe("2030-01-01T03:30:00.000Z");

    await updateTask(ownerId, id, input({ title: "Renamed", remindAt: "2030-01-01T09:00" }));
    expect(await remindersOf(id)).toHaveLength(1);

    await updateTask(ownerId, id, input({ remindAt: "2030-01-02T10:00" }));
    rows = await remindersOf(id);
    expect(rows.map((row) => row.status)).toEqual(["cancelled", "scheduled"]);

    await updateTask(ownerId, id, input());
    rows = await remindersOf(id);
    expect(rows.map((row) => row.status)).toEqual(["cancelled", "cancelled"]);
    expect((await getTask(ownerId, id))!.reminder).toBeNull();
  });

  it("delivers a due reminder through the job runner until it is dismissed", async () => {
    const id = await create({
      remindAt: toLocalInput(new Date(Date.now() - 60_000), ZONE),
    });

    expect(await listDeliveredReminders(ownerId)).toEqual([]);
    const summary = await runDueJobs(handlers, 10_000);
    expect(summary).toMatchObject({ done: 1, failed: 0 });

    const delivered = await listDeliveredReminders(ownerId);
    expect(delivered).toMatchObject([{ taskId: id, title: "Call Priya" }]);
    expect((await getTask(ownerId, id))!.reminder).toMatchObject({ status: "sent" });

    expect(await dismissReminder(ownerId, delivered[0].id)).toBe(true);
    expect(await listDeliveredReminders(ownerId)).toEqual([]);
  });

  it("does not deliver a reminder for a task that was completed first", async () => {
    const id = await create({
      remindAt: toLocalInput(new Date(Date.now() - 60_000), ZONE),
    });
    await completeTask(ownerId, id);

    await runDueJobs(handlers, 10_000);

    expect((await remindersOf(id))[0].status).toBe("cancelled");
    expect(await listDeliveredReminders(ownerId)).toEqual([]);
  });

  it("completes a task once and reopens it", async () => {
    const id = await create();

    expect(await completeTask(ownerId, id)).toEqual({ nextId: null });
    expect(await completeTask(ownerId, id)).toBeNull();
    const done = await getTask(ownerId, id);
    expect(done).toMatchObject({ status: "done" });
    expect(done!.completedAt).toBeInstanceOf(Date);

    expect(await reopenTask(ownerId, id)).toBe(true);
    expect(await getTask(ownerId, id)).toMatchObject({
      status: "open",
      completedAt: null,
    });
  });

  it("cancels a task and its reminder", async () => {
    const id = await create({ remindAt: "2030-01-01T09:00" });

    expect(await cancelTask(ownerId, id)).toBe(true);

    expect(await getTask(ownerId, id)).toMatchObject({ status: "cancelled" });
    expect((await remindersOf(id))[0].status).toBe("cancelled");
  });

  it("creates the next occurrence when a repeating task is completed", async () => {
    const contactId = await createPerson();
    const firstDue = addDays(today, -21);
    const id = await create({
      dueDate: firstDue,
      repeat: "WEEKLY",
      contactId,
      priority: "high",
    });

    const result = await completeTask(ownerId, id);

    const next = await getTask(ownerId, result!.nextId!);
    // Three weeks overdue: the next one is today, not one of the missed weeks.
    expect(next).toMatchObject({
      status: "open",
      title: "Call Priya",
      priority: "high",
      contactId,
      dueOn: today,
      recurrenceRule: (await getTask(ownerId, id))!.recurrenceRule,
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "task.complete",
      after: { nextTaskId: result!.nextId },
    });
  });

  it("keeps the clock time and the reminder lead of a repeating timed task", async () => {
    const due = addDays(today, 1);
    const id = await create({
      dueDate: due,
      dueTime: "09:30",
      repeat: "DAILY",
      repeatEvery: "2",
      remindAt: `${today}T18:00`,
    });

    const result = await completeTask(ownerId, id);

    const next = await getTask(ownerId, result!.nextId!);
    expect(toLocalInput(next!.dueAt!, ZONE)).toBe(`${addDays(due, 2)}T09:30`);
    // The reminder was the evening before; it stays the evening before.
    expect(toLocalInput(next!.reminder!.remindAt, ZONE)).toBe(
      `${addDays(due, 1)}T18:00`,
    );
    expect(next!.reminder!.status).toBe("scheduled");
  });

  it("stops the series on a task that is reopened", async () => {
    const id = await create({ dueDate: today, repeat: "DAILY" });
    await completeTask(ownerId, id);

    await reopenTask(ownerId, id);

    expect((await getTask(ownerId, id))!.recurrenceRule).toBeNull();
    expect((await listTasks(ownerId)).rows).toHaveLength(2);
  });

  it("lists what is due by the owner's calendar, soonest first", async () => {
    const tomorrow = addDays(today, 1);
    await create({ title: "tomorrow, just after midnight", dueDate: tomorrow, dueTime: "00:30" });
    await create({ title: "today, late", dueDate: today, dueTime: "23:30" });
    await create({ title: "today, all day", dueDate: today });
    await create({ title: "overdue", dueDate: addDays(today, -1) });
    await create({ title: "undated" });
    const titles = async (range: Parameters<typeof listDueTasks>[1]) =>
      (await listDueTasks(ownerId, range)).map((row) => row.title);

    expect(await titles({ through: today })).toEqual([
      "overdue",
      "today, all day",
      "today, late",
    ]);
    expect(await titles({ from: today, through: addDays(today, 6) })).toEqual([
      "today, all day",
      "today, late",
      "tomorrow, just after midnight",
    ]);
  });

  it("hides a snoozed task from today until the snooze ends", async () => {
    const id = await create({ dueDate: today });
    const todays = () => listDueTasks(ownerId, { through: today, hideSnoozed: true });

    expect(await snoozeTask(ownerId, id, 1)).toBe(true);
    expect(await todays()).toHaveLength(0);
    expect(await listDueTasks(ownerId, { through: today })).toHaveLength(1);
    expect(toLocalInput((await getTask(ownerId, id))!.snoozedUntil!, ZONE)).toBe(
      `${addDays(today, 1)}T00:00`,
    );

    await snoozeTask(ownerId, id, null);
    expect(await todays()).toHaveLength(1);
  });

  it("pages open tasks by due date with undated ones last", async () => {
    await create({ title: "undated" });
    await create({ title: "third", dueDate: "2026-10-14" });
    await create({ title: "first", dueDate: "2026-10-12" });
    await create({ title: "second", dueDate: "2026-10-12", dueTime: "08:00" });
    await create({ title: "also undated" });

    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await listTasks(ownerId, { limit: 2, after });
      seen.push(...page.rows.map((row) => row.title));
      after = page.nextAfter ?? undefined;
    } while (after);

    expect(seen.slice(0, 3)).toEqual(["first", "second", "third"]);
    expect(seen.slice(3).sort()).toEqual(["also undated", "undated"]);
  });

  it("lists finished tasks separately, most recently closed first", async () => {
    const first = await create({ title: "first done" });
    const second = await create({ title: "second done" });
    await create({ title: "still open" });
    await completeTask(ownerId, first);
    await completeTask(ownerId, second);

    const done = await listTasks(ownerId, { status: "done" });
    expect(done.rows.map((row) => row.title)).toEqual([
      "second done",
      "first done",
    ]);
    expect((await listTasks(ownerId)).rows.map((row) => row.title)).toEqual([
      "still open",
    ]);
  });

  it("filters by contact", async () => {
    const contactId = await createPerson();
    await create({ title: "for Priya", contactId });
    await create({ title: "unrelated" });

    const { rows } = await listTasks(ownerId, { contactId });
    expect(rows.map((row) => row.title)).toEqual(["for Priya"]);
  });

  it("keeps another owner's tasks and reminders out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const id = await create({
      dueDate: today,
      remindAt: toLocalInput(new Date(Date.now() - 60_000), ZONE),
    });
    await runDueJobs(handlers, 10_000);
    const [reminder] = await listDeliveredReminders(ownerId);

    expect(await getTask(otherId, id)).toBeNull();
    expect((await listTasks(otherId)).rows).toHaveLength(0);
    expect(await listDueTasks(otherId, { through: today })).toHaveLength(0);
    expect(await listDeliveredReminders(otherId)).toEqual([]);
    expect(await updateTask(otherId, id, input())).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await completeTask(otherId, id)).toBeNull();
    expect(await cancelTask(otherId, id)).toBe(false);
    expect(await snoozeTask(otherId, id, 1)).toBe(false);
    expect(await dismissReminder(otherId, reminder.id)).toBe(false);
    expect((await db.select().from(tasks).where(eq(tasks.id, id)))[0].status).toBe(
      "open",
    );
  });
});
