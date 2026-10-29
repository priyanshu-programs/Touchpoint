import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { audit } from "@/modules/audit/service";

export const MAX_EXPORTS_AN_HOUR = 5;

const exports = (ownerId: string) =>
  and(eq(auditLog.ownerId, ownerId), eq(auditLog.action, "data.export"));

// An export reads every row the owner has, so it is limited, counted from the audit
// log where each one is recorded as it starts. The owner is locked while counting so
// two presses at once cannot both slip under the limit.
export async function startExport(ownerId: string): Promise<{ ok: true } | { ok: false; reason: "rate" }> {
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
    const recent = await tx.$count(
      auditLog,
      and(exports(ownerId), gt(auditLog.createdAt, sql`now() - interval '1 hour'`)),
    );
    if (recent >= MAX_EXPORTS_AN_HOUR) return { ok: false, reason: "rate" };
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "data.export",
      entityType: "owner",
      entityId: ownerId,
    });
    return { ok: true };
  });
}

export async function lastExport(ownerId: string) {
  const [row] = await db
    .select({ at: auditLog.createdAt })
    .from(auditLog)
    .where(exports(ownerId))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return row?.at ?? null;
}
