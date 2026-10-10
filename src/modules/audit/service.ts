import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  ownerId: string;
  actor: "user" | "ai" | "job" | "system";
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

// Takes the caller's transaction so the audit row commits or rolls back with the change it describes.
export async function audit(executor: Executor, entry: AuditEntry) {
  await executor.insert(auditLog).values(entry);
}

export async function listAudit(
  ownerId: string,
  options: { beforeId?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.ownerId, ownerId),
        // Comparing against the stored row keeps microsecond precision that a JS Date would lose.
        options.beforeId
          ? sql`(${auditLog.createdAt}, ${auditLog.id}) < (
              select created_at, id from audit_log
              where id = ${options.beforeId} and owner_id = ${ownerId}
            )`
          : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    rows: page,
    nextBeforeId: rows.length > limit ? page[page.length - 1].id : null,
  };
}
