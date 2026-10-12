import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executor, type Tx } from "@/db/client";
import { contactPhotos, contacts, fieldProvenance } from "@/db/schema";
import { FetchError, safeFetch, type Fetcher } from "@/lib/safe-fetch";
import { httpUrl } from "@/lib/url";
import { audit } from "@/modules/audit/service";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import { imageType } from "./website/image";
import type { Person } from "./website/people";

export const PHOTO_JOB = "contact.photo";
// A few hundred contacts with pictures stay well inside the free database tier.
export const MAX_PHOTO_BYTES = 300_000;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
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

  const known = await tx
    .select({
      id: contacts.id,
      name: sql<string>`lower(${contacts.fullName})`,
    })
    .from(contacts)
    .leftJoin(contactPhotos, eq(contactPhotos.contactId, contacts.id))
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        eq(contacts.organizationId, organizationId),
        isNull(contacts.archivedAt),
        isNull(contactPhotos.contactId),
        inArray(sql`lower(${contacts.fullName})`, [...pictured.keys()]),
        sql`not ${removedByOwner(ownerId, contacts.id)}`,
      ),
    );
  for (const contact of known) {
    const url = pictured.get(contact.name);
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
      maxBytes: MAX_PHOTO_BYTES,
      deadline: Date.now() + BUDGET_MS,
      accept: "image/*",
    });
  } catch (error) {
    // A missing picture leaves the contact as it was, with initials.
    if (error instanceof FetchError) return;
    throw error;
  }
  const contentType = imageType(image.body);
  if (
    image.status < 200 ||
    image.status >= 300 ||
    image.truncated ||
    !contentType ||
    !PHOTO_TYPES.includes(contentType)
  ) {
    return;
  }

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
      contentType,
      bytes: image.body,
      sha256: createHash("sha256").update(image.body).digest("hex"),
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
