import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contacts,
  enrichmentRuns,
  fieldProvenance,
  organizationLogos,
} from "@/db/schema";

const foundPeople = z.object({
  people: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(60),
        title: z.string().max(150).nullable(),
      }),
    )
    .max(12),
});

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

// People the last finished read found on the website who are not among the
// company's contacts, archived ones included, so nobody is offered twice.
export async function suggestedPeople(ownerId: string, organizationId: string) {
  const [run] = await db
    .select({ rawResult: enrichmentRuns.rawResult })
    .from(enrichmentRuns)
    .where(
      and(
        eq(enrichmentRuns.ownerId, ownerId),
        eq(enrichmentRuns.organizationId, organizationId),
        eq(enrichmentRuns.status, "done"),
      ),
    )
    .orderBy(desc(enrichmentRuns.createdAt))
    .limit(1);
  const found = foundPeople.safeParse(run?.rawResult);
  if (!found.success || found.data.people.length === 0) return [];

  const known = await db
    .select({ name: sql<string>`lower(${contacts.fullName})` })
    .from(contacts)
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        eq(contacts.organizationId, organizationId),
        inArray(
          sql`lower(${contacts.fullName})`,
          found.data.people.map((person) => person.name.toLowerCase()),
        ),
      ),
    );
  const names = new Set(known.map((row) => row.name));
  return found.data.people.filter(
    (person) => !names.has(person.name.toLowerCase()),
  );
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
