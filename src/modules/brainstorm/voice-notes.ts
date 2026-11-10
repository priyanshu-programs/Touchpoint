import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { zipSync } from "fflate";
import { db } from "@/db/client";
import {
  brainstormBoards,
  brainstormElements,
  brainstormVoiceNotes,
  files,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { audioType } from "@/modules/files/sniff";
import {
  audioExtension,
  MAX_BOARD_VOICE_NOTES,
  MAX_VOICE_BYTES,
  MAX_VOICE_STORED_BYTES,
  uniqueNames,
  voiceFileName,
  voiceOf,
  voiceZipName,
  VOICE_NOTES_PER_MINUTE,
  type VoiceRef,
} from "./voice";

export type VoiceResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "limit" | "too_large" | "kind" | "full" | "rate";
    };

const onBoard = (ownerId: string, boardId: string) =>
  and(eq(brainstormVoiceNotes.ownerId, ownerId), eq(brainstormVoiceNotes.boardId, boardId));
const owned = (ownerId: string, boardId: string) =>
  and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, boardId));

// Keeps a recording made on the board, under the card's own id for it. Unlike
// a picture it is stored as it came, once its first bytes show it is a
// recording a browser makes: nothing on the server reads past them.
export async function addVoiceNote(
  ownerId: string,
  { boardId, key }: VoiceRef,
  bytes: Buffer,
): Promise<VoiceResult> {
  if (bytes.length > MAX_VOICE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = audioType(bytes);
  if (!contentType) return { ok: false, reason: "kind" };

  return db.transaction(async (tx) => {
    // The board is held for the length of the change, so its limit cannot be
    // passed by two recordings at once.
    const [board] = await tx
      .select({ id: brainstormBoards.id })
      .from(brainstormBoards)
      .where(owned(ownerId, boardId))
      .for("update");
    if (!board) return { ok: false, reason: "not_found" };

    const held = await tx
      .select({ key: brainstormVoiceNotes.fileKey })
      .from(brainstormVoiceNotes)
      .where(onBoard(ownerId, boardId));
    // Sent again, after a dropped answer.
    if (held.some((kept) => kept.key === key)) return { ok: true };
    if (held.length >= MAX_BOARD_VOICE_NOTES) return { ok: false, reason: "limit" };

    const [{ recent }] = await tx
      .select({ recent: sql<number>`count(*)::int` })
      .from(brainstormVoiceNotes)
      .where(
        and(
          eq(brainstormVoiceNotes.ownerId, ownerId),
          gt(brainstormVoiceNotes.createdAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (recent >= VOICE_NOTES_PER_MINUTE) return { ok: false, reason: "rate" };

    const [{ voiceBytes }] = await tx
      .select({ voiceBytes: sql<number>`coalesce(sum(distinct_files.size), 0)::int` })
      .from(
        tx
          .selectDistinct({ id: files.id, size: files.size })
          .from(brainstormVoiceNotes)
          .innerJoin(files, eq(files.id, brainstormVoiceNotes.fileId))
          .where(eq(brainstormVoiceNotes.ownerId, ownerId))
          .as("distinct_files"),
      );
    if (voiceBytes + bytes.length > MAX_VOICE_STORED_BYTES) {
      return { ok: false, reason: "full" };
    }

    const fileId = await storeFile(tx, ownerId, bytes, contentType);
    if (!fileId) return { ok: false, reason: "full" };

    await tx.insert(brainstormVoiceNotes).values({ ownerId, boardId, fileKey: key, fileId });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.voice_add",
      entityType: "brainstorm",
      entityId: boardId,
      after: { contentType, size: bytes.length },
    });
    return { ok: true };
  });
}

// As the board opens, a recording no card shows goes, as a picture does: not
// when its card was deleted, since an undo could bring the card back until the
// board is opened again, and not in its first minutes, while the card that
// shows it may still be on its way. Says how many the board keeps.
export async function openVoiceNotes(ownerId: string, boardId: string) {
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(brainstormVoiceNotes)
      .where(
        and(
          onBoard(ownerId, boardId),
          lt(brainstormVoiceNotes.createdAt, sql`now() - interval '10 minutes'`),
          sql`not exists (
            select 1
            from ${brainstormElements} as element
            where element.board_id = ${boardId}
              and not element.deleted
              and element.data -> 'customData' -> 'voice' ->> 'key' = ${brainstormVoiceNotes.fileKey}
          )`,
        ),
      )
      .returning({ id: brainstormVoiceNotes.id });
    if (gone.length > 0) {
      await dropUnusedFiles(tx, ownerId);
      await audit(tx, {
        ownerId,
        actor: "system",
        action: "brainstorm.voice_dropped",
        entityType: "brainstorm",
        entityId: boardId,
        before: { voiceNotes: gone.length },
      });
    }
    const [{ kept }] = await tx
      .select({ kept: sql<number>`count(*)::int` })
      .from(brainstormVoiceNotes)
      .where(onBoard(ownerId, boardId));
    return kept;
  });
}

export async function countVoiceNotes(ownerId: string, boardId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brainstormVoiceNotes)
    .where(onBoard(ownerId, boardId));
  return count;
}

export async function getVoiceNote(ownerId: string, { boardId, key }: VoiceRef) {
  const [note] = await db
    .select({ contentType: files.contentType, bytes: files.bytes })
    .from(brainstormVoiceNotes)
    .innerJoin(files, eq(files.id, brainstormVoiceNotes.fileId))
    .where(and(onBoard(ownerId, boardId), eq(brainstormVoiceNotes.fileKey, key)));
  return note ?? null;
}

// Every recording a card on the board shows, in one zip named for the board,
// each file named "Board - Heading", oldest recording first. A recording two
// cards show is in it once, under one card's heading. Null when the board is not the owner's, or
// no card on it plays anything.
export async function zipVoiceNotes(ownerId: string, boardId: string) {
  const [board] = await db
    .select({ name: brainstormBoards.name })
    .from(brainstormBoards)
    .where(owned(ownerId, boardId));
  if (!board) return null;

  const cards = await db
    .select({ customData: sql<Record<string, unknown> | null>`${brainstormElements.data} -> 'customData'` })
    .from(brainstormElements)
    .where(
      and(
        eq(brainstormElements.boardId, boardId),
        eq(brainstormElements.ownerId, ownerId),
        eq(brainstormElements.deleted, false),
        sql`${brainstormElements.data} -> 'customData' -> 'voice' ->> 'key' is not null`,
      ),
    )
    .orderBy(brainstormElements.clock);
  const titles = new Map<string, string>();
  for (const card of cards) {
    const voice = voiceOf(card);
    if (voice && !titles.has(voice.key)) titles.set(voice.key, voice.title);
  }
  if (titles.size === 0) return null;

  const notes = await db
    .select({
      key: brainstormVoiceNotes.fileKey,
      contentType: files.contentType,
      bytes: files.bytes,
    })
    .from(brainstormVoiceNotes)
    .innerJoin(files, eq(files.id, brainstormVoiceNotes.fileId))
    .where(and(onBoard(ownerId, boardId), inArray(brainstormVoiceNotes.fileKey, [...titles.keys()])))
    .orderBy(brainstormVoiceNotes.createdAt);
  if (notes.length === 0) return null;

  const names = uniqueNames(
    notes.map(({ key, contentType }) =>
      voiceFileName(board.name, titles.get(key)!, audioExtension(contentType)),
    ),
  );
  // Recordings are packed already, so they are stored in the zip as they are.
  const zip = zipSync(
    Object.fromEntries(
      notes.map(({ bytes }, at) => [names[at], [new Uint8Array(bytes), { level: 0 }]]),
    ),
  );
  return { name: voiceZipName(board.name), bytes: zip };
}
