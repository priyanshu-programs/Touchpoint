import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Executor, type Tx } from "@/db/client";
import { workflowBoards, workflowNotes } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { boxRefusal } from "./attachments";
import type { BoxNote } from "./drawing";
import { MAX_BOARD_NOTES, type BoxRef, type NoteRef } from "./schema";

export type NoteResult =
  | { ok: true; notes: BoxNote[] }
  | { ok: false; reason: "not_found" | "no_box" | "limit" };

const onBoard = (ownerId: string, boardId: string) =>
  and(eq(workflowNotes.ownerId, ownerId), eq(workflowNotes.boardId, boardId));

// The notes on the boxes of one board, the oldest first.
async function list(
  executor: Executor,
  ownerId: string,
  boardId: string,
): Promise<BoxNote[]> {
  const rows = await executor
    .select({
      id: workflowNotes.id,
      elementId: workflowNotes.elementId,
      body: workflowNotes.body,
      createdAt: workflowNotes.createdAt,
    })
    .from(workflowNotes)
    .where(onBoard(ownerId, boardId))
    .orderBy(asc(workflowNotes.createdAt), asc(workflowNotes.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// `body` is checked by `noteBody` before it gets here.
export async function addNote(
  ownerId: string,
  box: BoxRef,
  body: string,
): Promise<NoteResult> {
  return db.transaction(async (tx) => {
    const reason = await boxRefusal(tx, ownerId, box);
    if (reason) return { ok: false, reason };
    const [{ held }] = await tx
      .select({ held: sql<number>`count(*)::int` })
      .from(workflowNotes)
      .where(onBoard(ownerId, box.boardId));
    if (held >= MAX_BOARD_NOTES) return { ok: false, reason: "limit" };

    await tx.insert(workflowNotes).values({ ownerId, ...box, body });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.note_add",
      entityType: "workflow",
      entityId: box.boardId,
      after: { elementId: box.elementId, body },
    });
    return { ok: true, notes: await list(tx, ownerId, box.boardId) };
  });
}

// The board's notes afterwards, or null when there was nothing to remove.
export async function removeNote(ownerId: string, { boardId, noteId }: NoteRef) {
  return db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(workflowNotes)
      .where(and(onBoard(ownerId, boardId), eq(workflowNotes.id, noteId)))
      .returning({ elementId: workflowNotes.elementId, body: workflowNotes.body });
    if (!gone) return null;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.note_remove",
      entityType: "workflow",
      entityId: boardId,
      before: gone,
    });
    return list(tx, ownerId, boardId);
  });
}

// A board's notes, as its whiteboard opens. The notes of a box no longer in the
// drawing go now and not when the box was deleted, as what a box carries does:
// until the whiteboard is opened again, an undo could still bring the box back.
export async function openNotes(ownerId: string, boardId: string) {
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, boardId)));
    if (!board) return null;

    const gone = await tx
      .delete(workflowNotes)
      .where(
        and(
          onBoard(ownerId, boardId),
          sql`not exists (
            select 1
            from workflow_boards as board,
              jsonb_array_elements(board.scene -> 'elements') as element
            where board.id = ${boardId}
              and element ->> 'id' = ${workflowNotes.elementId}
          )`,
        ),
      )
      .returning({ body: workflowNotes.body });
    if (gone.length > 0) {
      await audit(tx, {
        ownerId,
        actor: "system",
        action: "workflow.notes_dropped",
        entityType: "workflow",
        entityId: boardId,
        before: gone.map(({ body }) => body),
      });
    }
    return list(tx, ownerId, boardId);
  });
}

// A copy of a workflow carries the notes on its boxes, each with its own date.
export async function copyNotes(
  tx: Tx,
  ownerId: string,
  { from, to, boxes }: { from: string; to: string; boxes: ReadonlySet<string> },
) {
  const held = await tx
    .select({
      elementId: workflowNotes.elementId,
      body: workflowNotes.body,
      createdAt: workflowNotes.createdAt,
    })
    .from(workflowNotes)
    .where(onBoard(ownerId, from));
  const kept = held.filter(({ elementId }) => boxes.has(elementId));
  if (kept.length === 0) return;
  await tx
    .insert(workflowNotes)
    .values(kept.map((row) => ({ ...row, ownerId, boardId: to })));
}
