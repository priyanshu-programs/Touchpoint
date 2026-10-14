import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db, type Executor, type Tx } from "@/db/client";
import { files, workflowAttachments, workflowBoards } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { fileType } from "@/modules/files/sniff";
import { MAX_FILE_BYTES, STAGE_SHAPES, type BoxAttachment } from "./drawing";
import {
  MAX_ATTACHMENT_TITLE,
  MAX_BOARD_ATTACHMENTS,
  UPLOADS_PER_MINUTE,
  type AttachmentRef,
  type BoxLink,
  type BoxRef,
} from "./schema";

export type AttachResult =
  | { ok: true; attachments: BoxAttachment[] }
  | {
      ok: false;
      reason:
        | "not_found"
        | "no_box"
        | "limit"
        | "too_large"
        | "kind"
        | "full"
        | "rate";
    };

const onBoard = (ownerId: string, boardId: string) =>
  and(
    eq(workflowAttachments.ownerId, ownerId),
    eq(workflowAttachments.boardId, boardId),
  );

// Everything the boxes of one board carry, the oldest first. Never a file's bytes.
const list = (
  executor: Executor,
  ownerId: string,
  boardId: string,
): Promise<BoxAttachment[]> =>
  executor
    .select({
      id: workflowAttachments.id,
      elementId: workflowAttachments.elementId,
      title: workflowAttachments.title,
      url: workflowAttachments.url,
      size: files.size,
      contentType: files.contentType,
    })
    .from(workflowAttachments)
    .leftJoin(files, eq(files.id, workflowAttachments.fileId))
    .where(onBoard(ownerId, boardId))
    .orderBy(asc(workflowAttachments.createdAt), asc(workflowAttachments.id));

const count = sql<number>`count(*)::int`;

// Why nothing more can go on that box, or nothing. The board is held for the
// length of the change, so its limit cannot be passed by two at once, and the
// box is looked for in the drawing as stored, without loading the drawing.
async function refusal(tx: Tx, ownerId: string, { boardId, elementId }: BoxRef) {
  const shapes = sql.join(
    STAGE_SHAPES.map((shape) => sql`${shape}`),
    sql`, `,
  );
  const [board] = await tx
    .select({
      isBox: sql<boolean>`exists (
        select 1
        from jsonb_array_elements(${workflowBoards.scene} -> 'elements') as element
        where element ->> 'id' = ${elementId} and element ->> 'type' in (${shapes})
      )`,
    })
    .from(workflowBoards)
    .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, boardId)))
    .for("update");
  if (!board) return "not_found";
  if (!board.isBox) return "no_box";

  const [{ carried }] = await tx
    .select({ carried: count })
    .from(workflowAttachments)
    .where(onBoard(ownerId, boardId));
  return carried >= MAX_BOARD_ATTACHMENTS ? "limit" : null;
}

export async function addLink(
  ownerId: string,
  box: BoxRef,
  { title, url }: BoxLink,
): Promise<AttachResult> {
  return db.transaction(async (tx) => {
    const reason = await refusal(tx, ownerId, box);
    if (reason) return { ok: false, reason };

    const named = title ?? new URL(url).hostname;
    await tx
      .insert(workflowAttachments)
      .values({ ownerId, ...box, title: named, url });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.attachment_add",
      entityType: "workflow",
      entityId: box.boardId,
      after: { title: named, url },
    });
    return { ok: true, attachments: await list(tx, ownerId, box.boardId) };
  });
}

// A file goes by the name it was uploaded under, without what a name cannot hold.
const fileTitle = (name: string) =>
  name
    .replace(/[\p{Cc}\\/]+/gu, " ")
    .trim()
    .slice(0, MAX_ATTACHMENT_TITLE) || "Untitled file";

// The kind of file is read from its bytes; the name is only what it is called.
export async function addFile(
  ownerId: string,
  box: BoxRef,
  { name, bytes }: { name: string; bytes: Buffer },
): Promise<AttachResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = fileType(bytes);
  if (!contentType) return { ok: false, reason: "kind" };

  return db.transaction(async (tx) => {
    const reason = await refusal(tx, ownerId, box);
    if (reason) return { ok: false, reason };

    const [{ recent }] = await tx
      .select({ recent: count })
      .from(workflowAttachments)
      .where(
        and(
          eq(workflowAttachments.ownerId, ownerId),
          isNotNull(workflowAttachments.fileId),
          gt(workflowAttachments.createdAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (recent >= UPLOADS_PER_MINUTE) return { ok: false, reason: "rate" };

    const fileId = await storeFile(tx, ownerId, bytes, contentType);
    if (!fileId) return { ok: false, reason: "full" };

    const title = fileTitle(name);
    await tx.insert(workflowAttachments).values({ ownerId, ...box, title, fileId });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.attachment_add",
      entityType: "workflow",
      entityId: box.boardId,
      after: { title, contentType, size: bytes.length },
    });
    return { ok: true, attachments: await list(tx, ownerId, box.boardId) };
  });
}

// What the board carries afterwards, or null when there was nothing to remove.
export async function removeAttachment(
  ownerId: string,
  { boardId, attachmentId }: AttachmentRef,
) {
  return db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(workflowAttachments)
      .where(
        and(onBoard(ownerId, boardId), eq(workflowAttachments.id, attachmentId)),
      )
      .returning({
        title: workflowAttachments.title,
        url: workflowAttachments.url,
        fileId: workflowAttachments.fileId,
      });
    if (!gone) return null;
    if (gone.fileId) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.attachment_remove",
      entityType: "workflow",
      entityId: boardId,
      before: { title: gone.title, url: gone.url },
    });
    return list(tx, ownerId, boardId);
  });
}

// What a board's boxes carry, as the whiteboard opens. What a box that is no
// longer in the drawing carried goes now and not when the box was deleted: until
// the whiteboard is opened again, an undo could still bring that box back.
export async function openAttachments(ownerId: string, boardId: string) {
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, boardId)));
    if (!board) return null;

    const gone = await tx
      .delete(workflowAttachments)
      .where(
        and(
          onBoard(ownerId, boardId),
          sql`not exists (
            select 1
            from workflow_boards as board,
              jsonb_array_elements(board.scene -> 'elements') as element
            where board.id = ${boardId}
              and element ->> 'id' = ${workflowAttachments.elementId}
          )`,
        ),
      )
      .returning({
        title: workflowAttachments.title,
        fileId: workflowAttachments.fileId,
      });
    if (gone.length > 0) {
      if (gone.some(({ fileId }) => fileId)) await dropUnusedFiles(tx, ownerId);
      await audit(tx, {
        ownerId,
        actor: "system",
        action: "workflow.attachments_dropped",
        entityType: "workflow",
        entityId: boardId,
        before: gone.map(({ title }) => title),
      });
    }
    return list(tx, ownerId, boardId);
  });
}

export async function getAttachmentFile(
  ownerId: string,
  { boardId, attachmentId }: AttachmentRef,
) {
  const [file] = await db
    .select({
      title: workflowAttachments.title,
      contentType: files.contentType,
      bytes: files.bytes,
    })
    .from(workflowAttachments)
    .innerJoin(files, eq(files.id, workflowAttachments.fileId))
    .where(and(onBoard(ownerId, boardId), eq(workflowAttachments.id, attachmentId)));
  return file ?? null;
}

// A copy of a workflow carries what its boxes carried. A file is pointed at
// again, not stored again, so a copy costs no room.
export async function copyAttachments(
  tx: Tx,
  ownerId: string,
  { from, to, boxes }: { from: string; to: string; boxes: ReadonlySet<string> },
) {
  const carried = await tx
    .select({
      elementId: workflowAttachments.elementId,
      title: workflowAttachments.title,
      url: workflowAttachments.url,
      fileId: workflowAttachments.fileId,
      createdAt: workflowAttachments.createdAt,
    })
    .from(workflowAttachments)
    .where(onBoard(ownerId, from));
  const kept = carried.filter(({ elementId }) => boxes.has(elementId));
  if (kept.length === 0) return;
  await tx
    .insert(workflowAttachments)
    .values(kept.map((row) => ({ ...row, ownerId, boardId: to })));
}
