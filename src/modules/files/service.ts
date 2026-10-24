import { createHash } from "node:crypto";
import { and, eq, notExists, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  brainstormPictures,
  files,
  materialVersions,
  workflowAttachments,
  workflowPictures,
} from "@/db/schema";

// The free database holds half a gigabyte for everything.
export const MAX_STORED_BYTES = 200 * 1024 * 1024;

// Held to the end of the transaction. A file is stored, found again or dropped
// one at a time per owner, so the limit cannot be passed by two uploads at once
// and a file is never dropped while something is about to point at it.
const lockFiles = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`files:${ownerId}`}))`);

// The id of the stored file with these bytes, storing them if the owner has no
// such file yet. Null when that would take the owner's files past the limit.
export async function storeFile(
  tx: Tx,
  ownerId: string,
  bytes: Buffer,
  contentType: string,
) {
  await lockFiles(tx, ownerId);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await tx
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerId, ownerId), eq(files.sha256, sha256)));
  if (existing) return existing.id;

  const [{ stored }] = await tx
    .select({ stored: sql<number>`coalesce(sum(${files.size}), 0)::int` })
    .from(files)
    .where(eq(files.ownerId, ownerId));
  if (stored + bytes.length > MAX_STORED_BYTES) return null;

  const [row] = await tx
    .insert(files)
    .values({ ownerId, contentType, size: bytes.length, sha256, bytes })
    .returning({ id: files.id });
  return row.id;
}

// Files nothing points at any more are deleted, wherever the last pointer went:
// removed by hand, or with its board, or with the board's company or person.
// A file is pointed at by what a box carries, by a picture on a board and by a
// version of a material.
export async function dropUnusedFiles(tx: Tx, ownerId: string) {
  await lockFiles(tx, ownerId);
  await tx.delete(files).where(
    and(
      eq(files.ownerId, ownerId),
      notExists(
        tx
          .select({ id: workflowAttachments.id })
          .from(workflowAttachments)
          .where(eq(workflowAttachments.fileId, files.id)),
      ),
      notExists(
        tx
          .select({ id: workflowPictures.id })
          .from(workflowPictures)
          .where(eq(workflowPictures.fileId, files.id)),
      ),
      notExists(
        tx
          .select({ id: brainstormPictures.id })
          .from(brainstormPictures)
          .where(eq(brainstormPictures.fileId, files.id)),
      ),
      notExists(
        tx
          .select({ id: materialVersions.id })
          .from(materialVersions)
          .where(eq(materialVersions.fileId, files.id)),
      ),
    ),
  );
}
