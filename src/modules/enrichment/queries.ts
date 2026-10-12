import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { httpUrl } from "@/lib/url";
import {
  contactOrganizations,
  contactPhotos,
  contacts,
  enrichmentRuns,
  fieldProvenance,
  organizationLogos,
} from "@/db/schema";
import { findSimilarContacts } from "@/modules/contacts/queries";

const foundPeople = z.object({
  people: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(60),
        title: z.string().max(150).nullable(),
        // Reads from before pictures were looked for have none.
        photo: httpUrl.nullable().default(null),
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

// The company fields whose current value was read from its website, and which of
// them the site did not state but the read worked out.
export async function websiteFields(ownerId: string, organizationId: string) {
  const rows = await db
    .select({
      field: fieldProvenance.field,
      confidence: fieldProvenance.confidence,
    })
    .from(fieldProvenance)
    .where(
      and(
        eq(fieldProvenance.ownerId, ownerId),
        eq(fieldProvenance.entityType, "organization"),
        eq(fieldProvenance.entityId, organizationId),
        eq(fieldProvenance.source, "website"),
      ),
    );
  return rows.map((row) => ({
    field: row.field,
    guessed: row.confidence === "guessed",
  }));
}

// People the last finished read found on the website who are not among the
// company's contacts, archived ones included, so nobody is offered twice. Each comes
// with the contacts they may already be: the owner says whether it is the same person.
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
    .select({
      name: sql<string>`lower(${contacts.fullName})`,
      // The name the website gives someone kept here under another.
      listedAs: sql<string | null>`lower(${contactOrganizations.listedAs})`,
    })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .where(
      and(
        eq(contactOrganizations.ownerId, ownerId),
        eq(contactOrganizations.organizationId, organizationId),
      ),
    );
  const names = new Set(known.flatMap((row) => [row.name, row.listedAs]));
  return Promise.all(
    found.data.people
      .filter((person) => !names.has(person.name.toLowerCase()))
      .map(async (person) => ({
        ...person,
        matches: (
          await findSimilarContacts(db, ownerId, person.name, organizationId)
        ).map((match) => ({
          id: match.id,
          name: match.name,
          companies: match.companies.map((company) => company.name),
          here: match.companies.some((company) => company.id === organizationId),
        })),
      })),
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

export async function getPhoto(ownerId: string, contactId: string) {
  const [row] = await db
    .select({
      contentType: contactPhotos.contentType,
      bytes: contactPhotos.bytes,
    })
    .from(contactPhotos)
    .where(
      and(
        eq(contactPhotos.ownerId, ownerId),
        eq(contactPhotos.contactId, contactId),
      ),
    );
  return row ?? null;
}
