import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { companyStatuses, organizations } from "@/db/schema";
import { keyFor } from "@/lib/key";
import { audit } from "@/modules/audit/service";
import {
  BUILT_IN_STATUSES,
  FALLBACK_STATUS,
  isBuiltInStatus,
  MAX_COMPANY_STATUSES,
  type StatusColor,
  type StatusInput,
} from "./schema";

export type CompanyStatusResult =
  | { ok: true; key: string }
  | {
      ok: false;
      reason: "limit" | "label_taken" | "built_in" | "not_found";
    };

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const owned = (ownerId: string, key: string) =>
  and(eq(companyStatuses.ownerId, ownerId), eq(companyStatuses.key, key));

const rowsOf = (tx: Tx, ownerId: string) =>
  tx.select().from(companyStatuses).where(eq(companyStatuses.ownerId, ownerId));

// A menu tells its statuses apart by name, built-in ones included.
const labelTaken = (
  existing: { key: string; label: string }[],
  label: string,
  exceptKey?: string,
) =>
  BUILT_IN_STATUSES.some((status) => sameText(status.label, label)) ||
  existing.some(
    (status) =>
      !isBuiltInStatus(status.key) &&
      status.key !== exceptKey &&
      sameText(status.label, label),
  );

// Whether a company of this owner may hold the status. The owner's own is read
// with a lock, so a delete under way waits for the company to be saved and then
// moves it, instead of leaving it on a status that is gone.
export async function statusOnOffer(tx: Tx, ownerId: string, key: string) {
  if (isBuiltInStatus(key)) return true;
  const [row] = await tx
    .select({ key: companyStatuses.key })
    .from(companyStatuses)
    .where(owned(ownerId, key))
    .for("share");
  return Boolean(row);
}

export async function createCompanyStatus(
  ownerId: string,
  input: StatusInput,
): Promise<CompanyStatusResult> {
  return db.transaction(async (tx) => {
    const existing = await rowsOf(tx, ownerId);
    const own = existing.filter(({ key }) => !isBuiltInStatus(key));
    if (own.length >= MAX_COMPANY_STATUSES) return { ok: false, reason: "limit" };
    if (labelTaken(existing, input.label)) {
      return { ok: false, reason: "label_taken" };
    }

    const key = keyFor(
      input.label,
      new Set([
        ...BUILT_IN_STATUSES.map((status) => status.key),
        ...existing.map((status) => status.key),
      ]),
      "status",
    );
    await tx
      .insert(companyStatuses)
      .values({ ownerId, key, label: input.label, color: input.color });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "status.create",
      entityType: "company_status",
      entityId: key,
      after: { label: input.label, color: input.color },
    });
    return { ok: true, key };
  });
}

// Any status takes a colour. For a built-in one the choice is kept in a row of
// its own, since the status itself lives in code.
export async function setCompanyStatusColor(
  ownerId: string,
  key: string,
  color: StatusColor,
) {
  return db.transaction(async (tx) => {
    const builtIn = BUILT_IN_STATUSES.find((status) => status.key === key);
    const [before] = await tx
      .select({ color: companyStatuses.color })
      .from(companyStatuses)
      .where(owned(ownerId, key))
      .for("update");
    if (!before && !builtIn) return false;

    if (before) {
      await tx.update(companyStatuses).set({ color }).where(owned(ownerId, key));
    } else {
      await tx
        .insert(companyStatuses)
        .values({ ownerId, key, label: builtIn!.label, color });
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "status.update",
      entityType: "company_status",
      entityId: key,
      before: { color: before?.color ?? builtIn!.color },
      after: { color },
    });
    return true;
  });
}

// The key stays, so every company holding the status follows the new name.
export async function renameCompanyStatus(
  ownerId: string,
  key: string,
  label: string,
): Promise<CompanyStatusResult> {
  if (isBuiltInStatus(key)) return { ok: false, reason: "built_in" };
  return db.transaction(async (tx) => {
    const existing = await rowsOf(tx, ownerId);
    const before = existing.find((status) => status.key === key);
    if (!before) return { ok: false, reason: "not_found" };
    if (labelTaken(existing, label, key)) {
      return { ok: false, reason: "label_taken" };
    }

    await tx.update(companyStatuses).set({ label }).where(owned(ownerId, key));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "status.update",
      entityType: "company_status",
      entityId: key,
      before: { label: before.label },
      after: { label },
    });
    return { ok: true, key };
  });
}

// The companies holding it are not left without a status: they become Other.
export async function deleteCompanyStatus(
  ownerId: string,
  key: string,
): Promise<CompanyStatusResult> {
  if (isBuiltInStatus(key)) return { ok: false, reason: "built_in" };
  return db.transaction(async (tx) => {
    const [before] = await tx
      .delete(companyStatuses)
      .where(owned(ownerId, key))
      .returning();
    if (!before) return { ok: false, reason: "not_found" };

    const moved = await tx
      .update(organizations)
      .set({ status: FALLBACK_STATUS })
      .where(
        and(eq(organizations.ownerId, ownerId), eq(organizations.status, key)),
      )
      .returning({ id: organizations.id });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "status.delete",
      entityType: "company_status",
      entityId: key,
      before: { label: before.label, color: before.color },
      after: { companiesMoved: moved.length, movedTo: FALLBACK_STATUS },
    });
    return { ok: true, key };
  });
}
