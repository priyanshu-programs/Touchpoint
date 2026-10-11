import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  activities,
  activityContacts,
  contacts,
  organizations,
} from "@/db/schema";
import { fromLocalInput } from "@/lib/time";
import { audit } from "@/modules/audit/service";
import { ownerTimezone } from "@/modules/settings/service";
import { insertTask } from "@/modules/tasks/service";
import type { ActivityInput, LogActivityInput } from "./schema";

export type ActivityResult =
  | { ok: true; id: string; followUpTaskId: string | null }
  | {
      ok: false;
      reason: "unknown_contact" | "unknown_organization" | "not_found";
    };

type ActivityRow = typeof activities.$inferSelect;

const snapshot = (row: ActivityRow, contactIds: string[]) => ({
  kind: row.kind,
  direction: row.direction,
  occurredAt: row.occurredAt,
  title: row.title,
  body: row.body,
  outcome: row.outcome,
  organizationId: row.organizationId,
  contactIds,
});

async function unknownLink(tx: Tx, ownerId: string, input: ActivityInput) {
  if (input.contactIds.length > 0) {
    const rows = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.ownerId, ownerId),
          inArray(contacts.id, input.contactIds),
        ),
      );
    if (rows.length !== input.contactIds.length) return "unknown_contact" as const;
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

function columns(input: ActivityInput, timezone: string) {
  return {
    kind: input.kind,
    direction: input.direction,
    occurredAt: fromLocalInput(input.occurredAt, timezone),
    title: input.title,
    body: input.body,
    outcome: input.outcome,
    organizationId: input.organizationId,
  };
}

async function linkContacts(
  tx: Tx,
  ownerId: string,
  activityId: string,
  contactIds: string[],
) {
  if (contactIds.length === 0) return;
  await tx
    .insert(activityContacts)
    .values(contactIds.map((contactId) => ({ activityId, contactId, ownerId })));
}

const contactIdsOf = async (tx: Tx, ownerId: string, activityId: string) =>
  (
    await tx
      .select({ contactId: activityContacts.contactId })
      .from(activityContacts)
      .where(
        and(
          eq(activityContacts.ownerId, ownerId),
          eq(activityContacts.activityId, activityId),
        ),
      )
  ).map((row) => row.contactId);

async function lockActivity(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.ownerId, ownerId), eq(activities.id, id)))
    .for("update");
  return row;
}

// The interaction and its follow-up task are one decision, so they commit together.
export async function logActivity(
  ownerId: string,
  input: LogActivityInput,
): Promise<ActivityResult> {
  return db.transaction(async (tx) => {
    const problem = await unknownLink(tx, ownerId, input);
    if (problem) return { ok: false, reason: problem };

    const timezone = await ownerTimezone(tx, ownerId);
    const [row] = await tx
      .insert(activities)
      .values({ ownerId, ...columns(input, timezone) })
      .returning();
    await linkContacts(tx, ownerId, row.id, input.contactIds);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "activity.create",
      entityType: "activity",
      entityId: row.id,
      after: snapshot(row, input.contactIds),
    });

    const followUpTaskId = input.followUpDate
      ? await insertTask(
          tx,
          ownerId,
          timezone,
          {
            title: input.followUpTitle ?? `Follow up: ${input.title}`,
            notes: null,
            priority: "normal",
            dueDate: input.followUpDate,
            dueTime: null,
            repeat: null,
            repeatEvery: 1,
            remindAt: null,
            contactId: input.contactIds[0] ?? null,
            organizationId: input.organizationId,
          },
          "follow_up",
        )
      : null;
    return { ok: true, id: row.id, followUpTaskId };
  });
}

export async function updateActivity(
  ownerId: string,
  id: string,
  input: ActivityInput,
): Promise<ActivityResult> {
  return db.transaction(async (tx) => {
    const before = await lockActivity(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    const problem = await unknownLink(tx, ownerId, input);
    if (problem) return { ok: false, reason: problem };

    const contactsBefore = await contactIdsOf(tx, ownerId, id);
    const timezone = await ownerTimezone(tx, ownerId);
    const [row] = await tx
      .update(activities)
      .set(columns(input, timezone))
      .where(and(eq(activities.ownerId, ownerId), eq(activities.id, id)))
      .returning();
    await tx
      .delete(activityContacts)
      .where(
        and(
          eq(activityContacts.ownerId, ownerId),
          eq(activityContacts.activityId, id),
        ),
      );
    await linkContacts(tx, ownerId, id, input.contactIds);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "activity.update",
      entityType: "activity",
      entityId: id,
      before: snapshot(before, contactsBefore),
      after: snapshot(row, input.contactIds),
    });
    return { ok: true, id, followUpTaskId: null };
  });
}

// A log entry made by mistake is removed outright; the audit row keeps what it said.
export async function deleteActivity(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockActivity(tx, ownerId, id);
    if (!before) return null;
    const contactIds = await contactIdsOf(tx, ownerId, id);
    await tx
      .delete(activities)
      .where(and(eq(activities.ownerId, ownerId), eq(activities.id, id)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "activity.delete",
      entityType: "activity",
      entityId: id,
      before: snapshot(before, contactIds),
    });
    return { organizationId: before.organizationId, contactIds };
  });
}
