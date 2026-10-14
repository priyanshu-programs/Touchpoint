import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { files, workflowBoards, workflowPictures } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { compressImage } from "@/modules/enrichment/website/image";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { MAX_FILE_BYTES, MAX_PICTURE_SIDE } from "./drawing";
import {
  MAX_BOARD_PICTURES,
  PICTURES_PER_MINUTE,
  type PictureRef,
} from "./schema";

const QUALITY = 80;

export type PictureResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "limit" | "too_large" | "kind" | "full" | "rate";
    };

const onBoard = (ownerId: string, boardId: string) =>
  and(eq(workflowPictures.ownerId, ownerId), eq(workflowPictures.boardId, boardId));

// The ids of the pictures a drawing shows.
export const picturesOf = (elements: readonly Record<string, unknown>[]) =>
  new Set(
    elements.flatMap(({ type, fileId }) =>
      type === "image" && typeof fileId === "string" ? [fileId] : [],
    ),
  );

// Keeps a picture the whiteboard has just been given, under the whiteboard's
// own id for it. The bytes are read as a picture and written out again, so
// what is stored is never the file as it came; one that cannot be read that
// way is not a picture this keeps.
export async function addPicture(
  ownerId: string,
  { boardId, key }: PictureRef,
  bytes: Buffer,
): Promise<PictureResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const picture = await compressImage(bytes, {
    side: MAX_PICTURE_SIDE,
    quality: QUALITY,
  });
  if (!picture) return { ok: false, reason: "kind" };

  return db.transaction(async (tx) => {
    // The board is held for the length of the change, so its limit cannot be
    // passed by two pictures at once.
    const [board] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, boardId)))
      .for("update");
    if (!board) return { ok: false, reason: "not_found" };

    const held = await tx
      .select({ key: workflowPictures.fileKey })
      .from(workflowPictures)
      .where(onBoard(ownerId, boardId));
    // Sent again, after a dropped answer or from a second element showing it.
    if (held.some((kept) => kept.key === key)) return { ok: true };
    if (held.length >= MAX_BOARD_PICTURES) return { ok: false, reason: "limit" };

    const [{ recent }] = await tx
      .select({ recent: sql<number>`count(*)::int` })
      .from(workflowPictures)
      .where(
        and(
          eq(workflowPictures.ownerId, ownerId),
          gt(workflowPictures.createdAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (recent >= PICTURES_PER_MINUTE) return { ok: false, reason: "rate" };

    const fileId = await storeFile(tx, ownerId, picture.bytes, picture.contentType);
    if (!fileId) return { ok: false, reason: "full" };

    await tx
      .insert(workflowPictures)
      .values({ ownerId, boardId, fileKey: key, fileId });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.picture_add",
      entityType: "workflow",
      entityId: boardId,
      after: { contentType: picture.contentType, size: picture.bytes.length },
    });
    return { ok: true };
  });
}

// The ids of a board's pictures, as the whiteboard opens. A picture no element
// of the stored drawing shows goes now and not when it was deleted, since until
// the whiteboard is opened again an undo could bring it back. One stored in the
// last few minutes is left: the drawing that shows it may be on its way still,
// sent as the page before this one was closed.
export async function openPictures(ownerId: string, boardId: string) {
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, boardId)));
    if (!board) return null;

    const gone = await tx
      .delete(workflowPictures)
      .where(
        and(
          onBoard(ownerId, boardId),
          lt(workflowPictures.createdAt, sql`now() - interval '10 minutes'`),
          sql`not exists (
            select 1
            from workflow_boards as board,
              jsonb_array_elements(board.scene -> 'elements') as element
            where board.id = ${boardId}
              and element ->> 'type' = 'image'
              and element ->> 'fileId' = ${workflowPictures.fileKey}
          )`,
        ),
      )
      .returning({ id: workflowPictures.id });
    if (gone.length > 0) {
      await dropUnusedFiles(tx, ownerId);
      await audit(tx, {
        ownerId,
        actor: "system",
        action: "workflow.pictures_dropped",
        entityType: "workflow",
        entityId: boardId,
        before: { pictures: gone.length },
      });
    }

    const kept = await tx
      .select({ key: workflowPictures.fileKey })
      .from(workflowPictures)
      .where(onBoard(ownerId, boardId));
    return kept.map(({ key }) => key);
  });
}

export async function getPicture(ownerId: string, { boardId, key }: PictureRef) {
  const [picture] = await db
    .select({ contentType: files.contentType, bytes: files.bytes })
    .from(workflowPictures)
    .innerJoin(files, eq(files.id, workflowPictures.fileId))
    .where(and(onBoard(ownerId, boardId), eq(workflowPictures.fileKey, key)));
  return picture ?? null;
}

// A copy of a workflow shows the pictures its drawing shows. A picture is
// pointed at again, not stored again, so a copy costs no room.
export async function copyPictures(
  tx: Tx,
  ownerId: string,
  { from, to, shown }: { from: string; to: string; shown: ReadonlySet<string> },
) {
  const held = await tx
    .select({
      fileKey: workflowPictures.fileKey,
      fileId: workflowPictures.fileId,
      createdAt: workflowPictures.createdAt,
    })
    .from(workflowPictures)
    .where(onBoard(ownerId, from));
  const kept = held.filter(({ fileKey }) => shown.has(fileKey));
  if (kept.length === 0) return;
  await tx
    .insert(workflowPictures)
    .values(kept.map((row) => ({ ...row, ownerId, boardId: to })));
}
