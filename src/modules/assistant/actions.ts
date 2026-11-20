import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  aiConversations,
  aiToolExecutions,
  contacts,
  organizations,
  tasks,
  TASK_PRIORITIES,
  type AiActionStatus,
  type AiActionTier,
  type AiActionTool,
} from "@/db/schema";
import { companyHref, contactHref } from "@/lib/record-href";
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from "@/lib/time";
import { deleteActivity, logActivity } from "@/modules/activities/service";
import { logActivityInput, type LogActivityInput } from "@/modules/activities/schema";
import { audit } from "@/modules/audit/service";
import { outsidersMessage } from "@/modules/contacts/at-company";
import {
  cancelMeeting,
  checkCancel,
  checkMeeting,
  checkMove,
  moveMeeting,
  scheduleMeeting,
} from "@/modules/integrations/scheduling";
import { meetingInput, type MeetingInput } from "@/modules/integrations/schema";
import { createTask } from "@/modules/tasks/service";
import { taskInput, type TaskInput } from "@/modules/tasks/schema";

// What the assistant may change, and how. A model can only ask: the tier is decided here,
// and a waiting action runs only from the owner's own press, with every check made again.

const localTime = z.iso.datetime({ local: true, precision: -1 });
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const actionInputs = {
  addTask: z.strictObject({
    title: z.string().trim().min(1).max(300),
    notes: z.string().trim().max(2000).optional(),
    dueDate: z.iso.date().optional(),
    dueTime: clock.optional(),
    remindAt: localTime.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    personId: z.uuid().optional(),
    companyId: z.uuid().optional(),
  }),
  addNote: z.strictObject({
    title: z.string().trim().min(1).max(300),
    body: z.string().trim().max(5000).optional(),
    personId: z.uuid().optional(),
    companyId: z.uuid().optional(),
  }),
  scheduleMeeting: z.strictObject({
    title: z.string().trim().min(1).max(200),
    startsAt: localTime,
    endsAt: localTime,
    personIds: z.array(z.uuid()).min(1).max(20),
    location: z.string().trim().max(300).optional(),
    emailGuests: z.boolean().default(true),
    addMeet: z.boolean().default(true),
  }),
  moveMeeting: z.strictObject({
    meetingId: z.uuid(),
    startsAt: localTime,
    endsAt: localTime,
    emailGuests: z.boolean().default(true),
  }),
  cancelMeeting: z.strictObject({
    meetingId: z.uuid(),
    emailGuests: z.boolean().default(true),
  }),
} satisfies Record<AiActionTool, z.ZodType>;

type Inputs = { [T in AiActionTool]: z.infer<(typeof actionInputs)[T]> };

// Text a stranger wrote has been read in this chat, so it might be steering the model.
export function tierOf(tool: AiActionTool, untrusted: boolean): AiActionTier {
  if (tool === "addTask" || tool === "addNote") return untrusted ? "confirm" : "undo";
  return "confirm";
}

const UNDOABLE: AiActionTool[] = ["addTask", "addNote"];

export type ActionCard = {
  id: string;
  tool: AiActionTool;
  status: AiActionStatus;
  summary: string;
  problem: string | null;
  href: string | null;
  canUndo: boolean;
};

type Row = typeof aiToolExecutions.$inferSelect;

function hrefOf(row: Row) {
  if (!row.resultId || row.status !== "done") return null;
  if (row.tool === "addTask") return `/tasks/${row.resultId}`;
  if (row.tool === "addNote") {
    const note = row.input as LogActivityInput;
    return note.organizationId
      ? companyHref(note.organizationId, "activity")
      : contactHref(note.contactIds[0], "activity");
  }
  if (row.tool === "cancelMeeting") return null;
  return `/meetings/${row.resultId}`;
}

export const cardOf = (row: Row): ActionCard => ({
  id: row.id,
  tool: row.tool,
  // A press that never finished reads as waiting, so it can be pressed again.
  status: row.status === "running" ? "waiting" : row.status,
  summary: row.summary,
  problem: row.problem,
  href: hrefOf(row),
  canUndo: row.status === "done" && UNDOABLE.includes(row.tool),
});

type Refusal = { ok: false; message: string };
type Prepared = { ok: true; stored: Record<string, unknown>; summary: string; resultId?: string };

async function names(ownerId: string, personIds: string[], companyId?: string) {
  const [people, companies] = await Promise.all([
    personIds.length
      ? db
          .select({ id: contacts.id, name: contacts.fullName })
          .from(contacts)
          .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.id, personIds)))
      : [],
    companyId
      ? db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, companyId)))
      : [],
  ]);
  if (people.length !== personIds.length || companies.length !== (companyId ? 1 : 0)) return null;
  return [...companies, ...people].map(({ name }) => name);
}

const NOT_FOUND = "That person or company isn't in Touchpoint. Look it up with findRecords first.";
const listed = new Intl.ListFormat("en-GB", { type: "conjunction" });

// The owner's words for what will happen, written from checked rows, and the input the
// service will be given, kept as is until it runs.
async function prepare(
  ownerId: string,
  timezone: string,
  tool: AiActionTool,
  raw: unknown,
  id: string,
): Promise<Prepared | Refusal> {
  if (tool === "addTask") {
    const input = raw as Inputs["addTask"];
    const parsed = taskInput.safeParse({
      title: input.title,
      notes: input.notes ?? "",
      priority: input.priority ?? "normal",
      dueDate: input.dueDate ?? "",
      dueTime: input.dueTime ?? "",
      repeat: "",
      repeatEvery: 1,
      remindAt: input.remindAt ?? "",
      contactId: input.personId ?? "",
      organizationId: input.companyId ?? "",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const task = parsed.data;
    const who = await names(ownerId, task.contactId ? [task.contactId] : [], task.organizationId ?? undefined);
    if (!who) return { ok: false, message: NOT_FOUND };
    const parts = [`"${task.title}"`];
    if (task.dueDate) parts.push(`due ${formatDate(task.dueDate)}${task.dueTime ? ` at ${task.dueTime}` : ""}`);
    if (who.length) parts.push(`with ${listed.format(who)}`);
    if (task.priority !== "normal") parts.push(`${task.priority} priority`);
    if (task.remindAt) {
      parts.push(`a reminder ${formatDateTime(fromLocalInput(task.remindAt, timezone), timezone)}`);
    }
    return { ok: true, stored: task, summary: `Task ${parts.join(", ")}.` };
  }

  if (tool === "addNote") {
    const input = raw as Inputs["addNote"];
    const parsed = logActivityInput.safeParse({
      kind: "note",
      direction: "",
      occurredAt: toLocalInput(new Date(), timezone),
      title: input.title,
      body: input.body ?? "",
      outcome: "",
      contactIds: input.personId ? [input.personId] : [],
      organizationId: input.companyId ?? "",
      followUpDate: "",
      followUpTitle: "",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const note = parsed.data;
    const who = await names(ownerId, note.contactIds, note.organizationId ?? undefined);
    if (!who) return { ok: false, message: NOT_FOUND };
    return {
      ok: true,
      stored: note,
      summary: `Note "${note.title}" on ${listed.format(who)}'s activity.`,
    };
  }

  if (tool === "scheduleMeeting") {
    const input = raw as Inputs["scheduleMeeting"];
    const parsed = meetingInput.safeParse({
      // This action's own id, so pressing Confirm twice can't make two meetings.
      key: id,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location ?? "",
      notes: "",
      contactIds: input.personIds,
      emailGuests: input.emailGuests ? "yes" : "",
      addMeet: input.addMeet ? "yes" : "",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    if (!(await names(ownerId, parsed.data.contactIds))) return { ok: false, message: NOT_FOUND };
    const checked = await checkMeeting(ownerId, parsed.data);
    if (!checked.ok) return checked;
    return { ok: true, stored: parsed.data, summary: checked.summary };
  }

  if (tool === "moveMeeting") {
    const input = raw as Inputs["moveMeeting"];
    const move = {
      eventId: input.meetingId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      emailGuests: input.emailGuests,
    };
    const checked = await checkMove(ownerId, move);
    if (!checked.ok) return checked;
    return { ok: true, stored: move, summary: checked.summary };
  }

  const input = raw as Inputs["cancelMeeting"];
  const cancel = { eventId: input.meetingId, emailGuests: input.emailGuests };
  const checked = await checkCancel(ownerId, cancel);
  if (!checked.ok) return checked;
  return { ok: true, stored: cancel, summary: checked.summary };
}

const TASK_REFUSALS = {
  unknown_contact: NOT_FOUND,
  unknown_organization: NOT_FOUND,
  not_found: NOT_FOUND,
} as const;

// Runs a checked input through the same services as the app's own forms.
async function perform(
  ownerId: string,
  tool: AiActionTool,
  stored: Record<string, unknown>,
): Promise<{ ok: true; resultId: string | null } | Refusal> {
  if (tool === "addTask") {
    const result = await createTask(ownerId, stored as TaskInput, false, "ai");
    if (result.ok) return { ok: true, resultId: result.id };
    return {
      ok: false,
      message: result.reason === "not_at_company" ? outsidersMessage(result.outsiders) : TASK_REFUSALS[result.reason],
    };
  }
  if (tool === "addNote") {
    const result = await logActivity(ownerId, stored as LogActivityInput, "ai");
    if (result.ok) return { ok: true, resultId: result.id };
    return {
      ok: false,
      message: result.reason === "not_at_company" ? outsidersMessage(result.outsiders) : TASK_REFUSALS[result.reason],
    };
  }
  if (tool === "scheduleMeeting") {
    const result = await scheduleMeeting(ownerId, stored as MeetingInput);
    return result.ok ? { ok: true, resultId: result.meetingId } : result;
  }
  if (tool === "moveMeeting") {
    const move = stored as { eventId: string; startsAt: string; endsAt: string; emailGuests: boolean };
    const result = await moveMeeting(ownerId, move);
    return result.ok ? { ok: true, resultId: move.eventId } : result;
  }
  const result = await cancelMeeting(ownerId, stored as { eventId: string; emailGuests: boolean });
  return result.ok ? { ok: true, resultId: null } : result;
}

export type ActionContext = {
  ownerId: string;
  timezone: string;
  conversationId: string;
  untrusted: boolean;
};

export type Proposed = { ok: true; card: ActionCard } | Refusal;

// The model's request. An undo action runs now; a confirm action is only written down.
export async function propose(
  context: ActionContext,
  tool: AiActionTool,
  raw: unknown,
): Promise<Proposed> {
  const id = crypto.randomUUID();
  const prepared = await prepare(context.ownerId, context.timezone, tool, raw, id);
  if (!prepared.ok) return prepared;
  const tier = tierOf(tool, context.untrusted);

  let resultId: string | null = null;
  if (tier === "undo") {
    const done = await perform(context.ownerId, tool, prepared.stored);
    if (!done.ok) return done;
    resultId = done.resultId;
  }
  const [row] = await db
    .insert(aiToolExecutions)
    .values({
      id,
      ownerId: context.ownerId,
      conversationId: context.conversationId,
      tool,
      tier,
      status: tier === "undo" ? "done" : "waiting",
      input: prepared.stored,
      summary: prepared.summary,
      resultId,
      decidedAt: tier === "undo" ? sql`now()` : null,
    })
    .returning();
  return { ok: true, card: cardOf(row) };
}

const own = (ownerId: string, id: string) =>
  and(eq(aiToolExecutions.ownerId, ownerId), eq(aiToolExecutions.id, id));

async function current(ownerId: string, id: string) {
  const [row] = await db.select().from(aiToolExecutions).where(own(ownerId, id));
  return row ? cardOf(row) : null;
}

// A press that never finished frees its action again after this long.
const STUCK = sql`now() - interval '2 minutes'`;

// The owner's press. Only one press can take a waiting action, so pressing twice runs
// it once; a refusal leaves it waiting with the reason, to press again or turn down.
export async function confirmAction(ownerId: string, id: string) {
  const [claimed] = await db
    .update(aiToolExecutions)
    .set({ status: "running", decidedAt: sql`now()` })
    .where(
      and(
        own(ownerId, id),
        or(
          eq(aiToolExecutions.status, "waiting"),
          and(eq(aiToolExecutions.status, "running"), lt(aiToolExecutions.decidedAt, STUCK)),
        ),
      ),
    )
    .returning();
  if (!claimed) return current(ownerId, id);

  const done = await perform(ownerId, claimed.tool, claimed.input);
  const [row] = await db
    .update(aiToolExecutions)
    .set(
      done.ok
        ? { status: "done", resultId: done.resultId, problem: null }
        : { status: "waiting", problem: done.message },
    )
    .where(own(ownerId, id))
    .returning();
  if (done.ok) {
    await audit(db, {
      ownerId,
      actor: "user",
      action: "assistant.action_confirm",
      entityType: "ai_tool_execution",
      entityId: id,
      after: { tool: row.tool, summary: row.summary },
    });
  }
  return cardOf(row);
}

export async function declineAction(ownerId: string, id: string) {
  await db
    .update(aiToolExecutions)
    .set({ status: "declined", decidedAt: sql`now()` })
    .where(and(own(ownerId, id), eq(aiToolExecutions.status, "waiting")));
  return current(ownerId, id);
}

// Takes back a task or note the assistant added. Gone already counts as undone.
export async function undoAction(ownerId: string, id: string) {
  const [claimed] = await db
    .update(aiToolExecutions)
    .set({ status: "undone" })
    .where(
      and(
        own(ownerId, id),
        eq(aiToolExecutions.status, "done"),
        inArray(aiToolExecutions.tool, UNDOABLE),
      ),
    )
    .returning();
  if (!claimed) return current(ownerId, id);

  if (claimed.tool === "addTask" && claimed.resultId) {
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.ownerId, ownerId),
            eq(tasks.id, claimed.resultId!),
            eq(tasks.origin, "ai"),
          ),
        )
        .returning({ title: tasks.title });
      if (!removed) return;
      await audit(tx, {
        ownerId,
        actor: "user",
        action: "task.delete",
        entityType: "task",
        entityId: claimed.resultId!,
        before: removed,
      });
    });
  }
  if (claimed.tool === "addNote" && claimed.resultId) {
    await deleteActivity(ownerId, claimed.resultId);
  }
  return cardOf(claimed);
}

// The cards a reply carries, as they stand now.
export async function cardsOf(ownerId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(aiToolExecutions)
    .where(and(eq(aiToolExecutions.ownerId, ownerId), inArray(aiToolExecutions.id, ids)));
  return ids.flatMap((id) => {
    const row = rows.find((found) => found.id === id);
    return row ? [cardOf(row)] : [];
  });
}

// From now on in this chat, even a task or a note waits for the owner's tap.
export async function markUntrusted(ownerId: string, conversationId: string) {
  await db
    .update(aiConversations)
    .set({ readUntrustedAt: sql`coalesce(${aiConversations.readUntrustedAt}, now())` })
    .where(and(eq(aiConversations.ownerId, ownerId), eq(aiConversations.id, conversationId)));
}
