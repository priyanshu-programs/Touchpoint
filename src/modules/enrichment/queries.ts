import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  enrichmentRuns,
  fieldProvenance,
  organizationLogos,
} from "@/db/schema";

export async function latestRun(ownerId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: enrichmentRuns.id,
      status: enrichmentRuns.status,
      error: enrichmentRuns.error,
      input: enrichmentRuns.input,
      finishedAt: enrichmentRuns.finishedAt,
    })
    .from(enrichmentRuns)
    .where(
      and(
        eq(enrichmentRuns.ownerId, ownerId),
        eq(enrichmentRuns.organizationId, organizationId),
      ),
    )
    .orderBy(desc(enrichmentRuns.createdAt))
    .limit(1);
  return row ?? null;
}

// The company fields whose current value was read from its website.
export async function websiteFields(ownerId: string, organizationId: string) {
  const rows = await db
    .select({ field: fieldProvenance.field })
    .from(fieldProvenance)
    .where(
      and(
        eq(fieldProvenance.ownerId, ownerId),
        eq(fieldProvenance.entityType, "organization"),
        eq(fieldProvenance.entityId, organizationId),
        eq(fieldProvenance.source, "website"),
      ),
    );
  return rows.map((row) => row.field);
}

export async function getLogo(ownerId: string, organizationId: string) {
  const [row] = await db
    .select({
      contentType: organizationLogos.contentType,
      bytes: organizationLogos.bytes,
      sha256: organizationLogos.sha256,
    })
    .from(organizationLogos)
    .where(
      and(
        eq(organizationLogos.ownerId, ownerId),
        eq(organizationLogos.organizationId, organizationId),
      ),
    );
  return row ?? null;
}
