import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contacts,
  engagementContacts,
  engagements,
  organizations,
  type EngagementStatus,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import {
  MAX_ENGAGEMENT_CONTACTS,
  MAX_ENGAGEMENTS,
  type EngagementContactInput,
  type EngagementInput,
} from "./schema";

export type EngagementResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "unknown_organization" | "limit" };

export type EngagementContactResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "unknown_contact" | "already_added" | "limit";
    };

type EngagementRow = typeof engagements.$inferSelect;

const snapshot = (row: EngagementRow) => ({
  title: row.title,
  status: row.status,
  organizationId: row.organizationId,
  valueMinor: row.valueMinor,
  currency: row.currency,
  startDate: row.startDate,
  targetEndDate: row.targetEndDate,
});

async function ownsOrganization(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)));
  return Boolean(row);
}

async function lockEngagement(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(engagements)
    .where(and(eq(engagements.ownerId, ownerId), eq(engagements.id, id)))
    .for("update");
  return row;
}

export async function createEngagement(
  ownerId: string,
  input: EngagementInput,
): Promise<EngagementResult> {
  return db.transaction(async (tx) => {
    if (!(await ownsOrganization(tx, ownerId, input.organizationId))) {
      return { ok: false, reason: "unknown_organization" };
    }
    const count = await tx.$count(engagements, eq(engagements.ownerId, ownerId));
    if (count >= MAX_ENGAGEMENTS) return { ok: false, reason: "limit" };

    const [row] = await tx
      .insert(engagements)
      .values({ ownerId, ...input })
      .returning();
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.create",
      entityType: "engagement",
      entityId: row.id,
      after: snapshot(row),
    });
    return { ok: true, id: row.id };
  });
}

export async function updateEngagement(
  ownerId: string,
  id: string,
  input: EngagementInput,
): Promise<EngagementResult> {
  return db.transaction(async (tx) => {
    const before = await lockEngagement(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (!(await ownsOrganization(tx, ownerId, input.organizationId))) {
      return { ok: false, reason: "unknown_organization" };
    }

    const [row] = await tx
      .update(engagements)
      .set(input)
      .where(eq(engagements.id, id))
      .returning();
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.update",
      entityType: "engagement",
      entityId: id,
      before: snapshot(before),
      after: snapshot(row),
    });
    return { ok: true, id };
  });
}

export async function setEngagementStatus(
  ownerId: string,
  id: string,
  status: EngagementStatus,
) {
  return db.transaction(async (tx) => {
    const before = await lockEngagement(tx, ownerId, id);
    if (!before) return false;
    if (before.status === status) return true;

    await tx.update(engagements).set({ status }).where(eq(engagements.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.status",
      entityType: "engagement",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return true;
  });
}

// Its people go with it; the companies and contacts themselves stay.
export async function deleteEngagement(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockEngagement(tx, ownerId, id);
    if (!before) return false;

    await tx.delete(engagements).where(eq(engagements.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.delete",
      entityType: "engagement",
      entityId: id,
      before: snapshot(before),
    });
    return true;
  });
}

export async function addEngagementContact(
  ownerId: string,
  engagementId: string,
  { contactId, role }: EngagementContactInput,
): Promise<EngagementContactResult> {
  return db.transaction(async (tx) => {
    if (!(await lockEngagement(tx, ownerId, engagementId))) {
      return { ok: false, reason: "not_found" };
    }
    const [contact] = await tx
      .select({ id: contacts.id, fullName: contacts.fullName })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, contactId)));
    if (!contact) return { ok: false, reason: "unknown_contact" };

    const onIt = await tx
      .select({ contactId: engagementContacts.contactId })
      .from(engagementContacts)
      .where(eq(engagementContacts.engagementId, engagementId));
    if (onIt.some((row) => row.contactId === contactId)) {
      return { ok: false, reason: "already_added" };
    }
    if (onIt.length >= MAX_ENGAGEMENT_CONTACTS) {
      return { ok: false, reason: "limit" };
    }

    await tx.insert(engagementContacts).values({ engagementId, contactId, role });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.contact_add",
      entityType: "engagement",
      entityId: engagementId,
      after: { contactId, name: contact.fullName, role },
    });
    return { ok: true };
  });
}

export async function removeEngagementContact(
  ownerId: string,
  engagementId: string,
  contactId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockEngagement(tx, ownerId, engagementId))) return false;

    const removed = await tx
      .delete(engagementContacts)
      .where(
        and(
          eq(engagementContacts.engagementId, engagementId),
          eq(engagementContacts.contactId, contactId),
        ),
      )
      .returning({ role: engagementContacts.role });
    if (removed.length === 0) return false;

    await audit(tx, {
      ownerId,
      actor: "user",
      action: "engagement.contact_remove",
      entityType: "engagement",
      entityId: engagementId,
      before: { contactId, role: removed[0].role },
    });
    return true;
  });
}
