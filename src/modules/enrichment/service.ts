import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executor, type Tx } from "@/db/client";
import {
  enrichmentRuns,
  fieldProvenance,
  organizationLogos,
  organizations,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import {
  ENRICHABLE_FIELDS,
  readWebsite,
  type EnrichableField,
  type Reading,
} from "./website/read";

export const ENRICHMENT_JOB = "enrichment.run";
const RUNS_PER_HOUR = 20;

export type EnrichmentRequest =
  | { ok: true; runId: string }
  | { ok: false; reason: "not_found" | "no_website" | "busy" | "rate_limited" };

// Queues one read of the company's website. Pass the caller's transaction so a
// new company and its first read commit together.
export async function requestEnrichment(
  ownerId: string,
  organizationId: string,
  executor: Executor = db,
): Promise<EnrichmentRequest> {
  const [organization] = await executor
    .select({ domain: organizations.domain, website: organizations.website })
    .from(organizations)
    .where(
      and(
        eq(organizations.ownerId, ownerId),
        eq(organizations.id, organizationId),
      ),
    );
  if (!organization) return { ok: false, reason: "not_found" };
  const url =
    organization.website ??
    (organization.domain ? `https://${organization.domain}` : null);
  if (!url) return { ok: false, reason: "no_website" };

  const [recent] = await executor
    .select({
      lastHour: sql<number>`count(*)::int`,
      thisCompanyLastMinute: sql<number>`(count(*) filter (
        where ${enrichmentRuns.organizationId} = ${organizationId}
          and ${enrichmentRuns.createdAt} > now() - interval '1 minute'
      ))::int`,
    })
    .from(enrichmentRuns)
    .where(
      and(
        eq(enrichmentRuns.ownerId, ownerId),
        sql`${enrichmentRuns.createdAt} > now() - interval '1 hour'`,
      ),
    );
  if (recent.lastHour >= RUNS_PER_HOUR || recent.thisCompanyLastMinute > 0) {
    return { ok: false, reason: "rate_limited" };
  }

  const runId = randomUUID();
  const jobId = await enqueue(
    {
      kind: ENRICHMENT_JOB,
      payload: { runId },
      dedupeKey: `${ENRICHMENT_JOB}:${organizationId}`,
      ownerId,
      // A site that cannot be read is an answer, not something to retry.
      maxAttempts: 1,
    },
    executor,
  );
  if (!jobId) return { ok: false, reason: "busy" };

  await executor.insert(enrichmentRuns).values({
    id: runId,
    ownerId,
    organizationId,
    input: { url: new URL("/", url).href },
  });
  return { ok: true, runId };
}

// An owner's edit outranks anything read later, including an edit that empties the field.
export async function markManual(
  tx: Tx,
  ownerId: string,
  organizationId: string,
  fields: EnrichableField[],
) {
  if (fields.length === 0) return;
  await tx
    .insert(fieldProvenance)
    .values(
      fields.map((field) => ({
        ownerId,
        entityType: "organization",
        entityId: organizationId,
        field,
        source: "manual",
        confidence: "verified",
      })),
    )
    .onConflictDoUpdate({
      target: [
        fieldProvenance.ownerId,
        fieldProvenance.entityType,
        fieldProvenance.entityId,
        fieldProvenance.field,
      ],
      set: {
        source: "manual",
        confidence: "verified",
        retrievedAt: new Date(),
        runId: null,
      },
    });
}

type Run = typeof enrichmentRuns.$inferSelect;

async function applyReading(run: Run, reading: Reading) {
  await db.transaction(async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.ownerId, run.ownerId),
          eq(organizations.id, run.organizationId),
        ),
      )
      .for("update");
    if (!organization) return;

    const manual = await tx
      .select({ field: fieldProvenance.field })
      .from(fieldProvenance)
      .where(
        and(
          eq(fieldProvenance.ownerId, run.ownerId),
          eq(fieldProvenance.entityType, "organization"),
          eq(fieldProvenance.entityId, run.organizationId),
          eq(fieldProvenance.source, "manual"),
        ),
      );
    const kept = new Set(manual.map((row) => row.field));
    const filled: Partial<Record<EnrichableField, string>> = {};
    for (const field of ENRICHABLE_FIELDS) {
      const value = reading.fields[field];
      if (value && !organization[field] && !kept.has(field)) {
        filled[field] = value;
      }
    }
    const filledFields = Object.keys(filled) as EnrichableField[];

    if (filledFields.length > 0) {
      await tx
        .update(organizations)
        .set(filled)
        .where(
          and(
            eq(organizations.ownerId, run.ownerId),
            eq(organizations.id, organization.id),
          ),
        );
      await tx
        .insert(fieldProvenance)
        .values(
          filledFields.map((field) => ({
            ownerId: run.ownerId,
            entityType: "organization",
            entityId: organization.id,
            field,
            source: "website",
            confidence: "inferred",
            runId: run.id,
          })),
        )
        .onConflictDoUpdate({
          target: [
            fieldProvenance.ownerId,
            fieldProvenance.entityType,
            fieldProvenance.entityId,
            fieldProvenance.field,
          ],
          set: {
            source: "website",
            confidence: "inferred",
            retrievedAt: new Date(),
            runId: run.id,
          },
        });
    }

    if (reading.logo) {
      const logo = {
        ownerId: run.ownerId,
        contentType: reading.logo.contentType,
        bytes: reading.logo.bytes,
        sha256: createHash("sha256").update(reading.logo.bytes).digest("hex"),
        sourceUrl: reading.logo.sourceUrl,
        fetchedAt: new Date(),
      };
      await tx
        .insert(organizationLogos)
        .values({ organizationId: organization.id, ...logo })
        .onConflictDoUpdate({
          target: organizationLogos.organizationId,
          set: logo,
        });
    }

    if (filledFields.length > 0 || reading.logo) {
      await audit(tx, {
        ownerId: run.ownerId,
        actor: "job",
        action: "organization.enrich",
        entityType: "organization",
        entityId: organization.id,
        before: Object.fromEntries(filledFields.map((field) => [field, null])),
        after: { ...filled, logo: reading.logo?.sourceUrl ?? null },
      });
    }

    await tx
      .update(enrichmentRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        rawResult: {
          fields: reading.fields,
          links: reading.links,
          logo: reading.logo && {
            sourceUrl: reading.logo.sourceUrl,
            contentType: reading.logo.contentType,
            bytes: reading.logo.bytes.length,
          },
          filled: filledFields,
        },
      })
      .where(eq(enrichmentRuns.id, run.id));
  });
}

const failRun = (runId: string, error: string) =>
  db
    .update(enrichmentRuns)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(enrichmentRuns.id, runId));

const jobPayload = z.object({ runId: z.uuid() });

// The job handler. Tests pass their own reader, since the real one only reaches public hosts.
export async function runEnrichment(job: ClaimedJob, read = readWebsite) {
  const { runId } = jobPayload.parse(job.payload);
  if (!job.ownerId) return;
  const [run] = await db
    .update(enrichmentRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(
        eq(enrichmentRuns.id, runId),
        eq(enrichmentRuns.ownerId, job.ownerId),
      ),
    )
    .returning();
  // The company was deleted before its turn came.
  if (!run) return;

  try {
    const result = await read(run.input.url);
    if (result.ok) await applyReading(run, result.reading);
    else await failRun(run.id, result.error);
  } catch (error) {
    await failRun(run.id, "error");
    throw error;
  }
}
