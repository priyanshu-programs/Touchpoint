import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executor, type Tx } from "@/db/client";
import {
  contactOrganizations,
  contactPhotos,
  contacts,
  fieldProvenance,
} from "@/db/schema";
import { FetchError, safeFetch, type Fetcher } from "@/lib/safe-fetch";
import { httpUrl } from "@/lib/url";
import { audit } from "@/modules/audit/service";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import { compressImage } from "./website/image";
import type { Person } from "./website/people";

export const PHOTO_JOB = "contact.photo";
// What may be downloaded. What is kept is a few kilobytes, so thousands of
// contacts with pictures stay well inside the free database tier.
export const MAX_PHOTO_DOWNLOAD = 5_000_000;
// Shown at 40 pixels; this leaves room for sharp screens and a larger view.
const PHOTO_FIT = { side: 256, quality: 80 };
const BUDGET_MS = 8_000;

// Queues the download of a picture found beside a person's name.
export const requestPhoto = (
  ownerId: string,
  contactId: string,
  url: string,
  executor: Executor = db,
) =>
  enqueue(
    {
      kind: PHOTO_JOB,
      payload: { contactId, url },
      dedupeKey: `${PHOTO_JOB}:${contactId}`,
      ownerId,
      // A picture that cannot be fetched is an answer, not something to retry.
      maxAttempts: 1,
    },
    executor,
  );

// The owner took the picture away, so no later read puts one back.
const removedByOwner = (ownerId: string, contactId: unknown) => sql`exists (
  select 1 from ${fieldProvenance}
  where ${fieldProvenance.ownerId} = ${ownerId}
    and ${fieldProvenance.entityType} = 'contact'
    and ${fieldProvenance.entityId} = ${contactId}
    and ${fieldProvenance.field} = 'photo'
    and ${fieldProvenance.source} = 'manual'
)`;

// Pictures for the people a read found who are already contacts at the company and have none.
export async function requestKnownPhotos(
  tx: Tx,
  ownerId: string,
  organizationId: string,
  people: Person[],
) {
  const pictured = new Map(
    people.flatMap((person) =>
      person.photo ? [[person.name.toLowerCase(), person.photo] as const] : [],
    ),
  );
  if (pictured.size === 0) return;

  const names = [...pictured.keys()];
  const known = await tx
    .select({
      id: contacts.id,
      name: sql<string>`lower(${contacts.fullName})`,
      // The name the website gives someone kept here under another.
      listedAs: sql<string | null>`lower(${contactOrganizations.listedAs})`,
    })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .leftJoin(contactPhotos, eq(contactPhotos.contactId, contacts.id))
    .where(
      and(
        eq(contactOrganizations.ownerId, ownerId),
        eq(contactOrganizations.organizationId, organizationId),
        isNull(contacts.archivedAt),
        isNull(contactPhotos.contactId),
        or(
          inArray(sql`lower(${contacts.fullName})`, names),
          inArray(sql`lower(${contactOrganizations.listedAs})`, names),
        ),
        sql`not ${removedByOwner(ownerId, contacts.id)}`,
      ),
    );
  for (const contact of known) {
    const url = pictured.get(contact.listedAs ?? "") ?? pictured.get(contact.name);
    if (url) await requestPhoto(ownerId, contact.id, url, tx);
  }
}

const jobPayload = z.object({ contactId: z.uuid(), url: httpUrl });

// The job handler. Tests pass their own fetcher, since the real one only reaches public hosts.
export async function fetchPhoto(job: ClaimedJob, fetcher: Fetcher = safeFetch) {
  const { contactId, url } = jobPayload.parse(job.payload);
  const ownerId = job.ownerId;
  if (!ownerId) return;

  let image;
  try {
    image = await fetcher(url, {
      maxBytes: MAX_PHOTO_DOWNLOAD,
      deadline: Date.now() + BUDGET_MS,
      accept: "image/*",
      // A photograph is a larger download than a page.
      timeoutMs: BUDGET_MS,
    });
  } catch (error) {
    // A missing picture leaves the contact as it was, with initials.
    if (error instanceof FetchError) return;
    throw error;
  }
  if (image.status < 200 || image.status >= 300 || image.truncated) return;
  const stored = await compressImage(image.body, PHOTO_FIT);
  if (!stored) return;

  await db.transaction(async (tx) => {
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.ownerId, ownerId),
          eq(contacts.id, contactId),
          sql`not ${removedByOwner(ownerId, contacts.id)}`,
        ),
      )
      .for("update");
    // Deleted, or the owner removed the picture, while this was waiting its turn.
    if (!contact) return;

    const photo = {
      ownerId,
      ...stored,
      sha256: createHash("sha256").update(stored.bytes).digest("hex"),
      sourceUrl: image.url,
      fetchedAt: new Date(),
    };
    await tx
      .insert(contactPhotos)
      .values({ contactId, ...photo })
      .onConflictDoUpdate({ target: contactPhotos.contactId, set: photo });
  });
}

export async function removeContactPhoto(ownerId: string, contactId: string) {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(contactPhotos)
      .where(
        and(
          eq(contactPhotos.ownerId, ownerId),
          eq(contactPhotos.contactId, contactId),
        ),
      )
      .returning({ sourceUrl: contactPhotos.sourceUrl });
    if (!removed) return false;

    await tx
      .insert(fieldProvenance)
      .values({
        ownerId,
        entityType: "contact",
        entityId: contactId,
        field: "photo",
        source: "manual",
        confidence: "verified",
      })
      .onConflictDoUpdate({
        target: [
          fieldProvenance.ownerId,
          fieldProvenance.entityType,
          fieldProvenance.entityId,
          fieldProvenance.field,
        ],
        set: { source: "manual", confidence: "verified", retrievedAt: new Date() },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.remove_photo",
      entityType: "contact",
      entityId: contactId,
      before: { photo: removed.sourceUrl },
    });
    return true;
  });
}
