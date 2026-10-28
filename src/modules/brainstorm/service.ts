import { and, asc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { brainstormBoards, brainstormElements } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles } from "@/modules/files/service";
import {
  MAX_BOARD_BYTES,
  MAX_BOARD_ELEMENTS,
  MAX_BRAINSTORM_BOARDS,
  type BrainstormChangesQuery,
  type BrainstormElementsSave,
  type BrainstormIcon,
  type BrainstormName,
} from "./schema";

export type BrainstormResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limit" | "name_taken" | "not_found" };

const owned = (ownerId: string, id: string) =>
  and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, id));

// Two boards being named at once cannot both take a name, or both pass the limit.
const lockOwner = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`brainstorm:${ownerId}`}))`);

// The name is citext, so this compares without regard to case.
async function nameTaken(tx: Tx, ownerId: string, name: string, except?: string) {
  const [row] = await tx
    .select({ id: brainstormBoards.id })
    .from(brainstormBoards)
    .where(
      and(
        eq(brainstormBoards.ownerId, ownerId),
        eq(brainstormBoards.name, name),
        except ? ne(brainstormBoards.id, except) : undefined,
      ),
    );
  return Boolean(row);
}

export async function createBrainstorm(
  ownerId: string,
  { name }: BrainstormName,
): Promise<BrainstormResult> {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const count = await tx.$count(brainstormBoards, eq(brainstormBoards.ownerId, ownerId));
    if (count >= MAX_BRAINSTORM_BOARDS) return { ok: false, reason: "limit" };
    if (await nameTaken(tx, ownerId, name)) return { ok: false, reason: "name_taken" };

    const [row] = await tx
      .insert(brainstormBoards)
      .values({ ownerId, name })
      .returning({ id: brainstormBoards.id });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.create",
      entityType: "brainstorm",
      entityId: row.id,
      after: { name },
    });
    return { ok: true, id: row.id };
  });
}

export async function renameBrainstorm(
  ownerId: string,
  id: string,
  { name }: BrainstormName,
): Promise<BrainstormResult> {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const [before] = await tx
      .select({ name: brainstormBoards.name })
      .from(brainstormBoards)
      .where(owned(ownerId, id))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };
    if (await nameTaken(tx, ownerId, name, id)) {
      return { ok: false, reason: "name_taken" };
    }

    await tx
      .update(brainstormBoards)
      .set({ name, updatedAt: sql`now()` })
      .where(owned(ownerId, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.rename",
      entityType: "brainstorm",
      entityId: id,
      before: { name: before.name },
      after: { name },
    });
    return { ok: true, id };
  });
}

export async function setBrainstormIcon(
  ownerId: string,
  { boardId, icon }: BrainstormIcon,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ icon: brainstormBoards.icon })
      .from(brainstormBoards)
      .where(owned(ownerId, boardId))
      .for("update");
    if (!before) return false;
    if (before.icon === icon) return true;
    await tx
      .update(brainstormBoards)
      .set({ icon, updatedAt: sql`now()` })
      .where(owned(ownerId, boardId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.icon",
      entityType: "brainstorm",
      entityId: boardId,
      before: { icon: before.icon },
      after: { icon },
    });
    return true;
  });
}

export async function deleteBrainstorm(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .delete(brainstormBoards)
      .where(owned(ownerId, id))
      .returning({ name: brainstormBoards.name });
    if (!before) return false;
    // Its pictures went with it; a file nothing else points at goes too.
    await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.delete",
      entityType: "brainstorm",
      entityId: id,
      before: { name: before.name },
    });
    return true;
  });
}

export type BrainstormSaveResult =
  | {
      ok: true;
      clock: number;
      // Whether another device changed the board since the clock this one sent.
      behind: boolean;
    }
  | { ok: false; reason: "not_found" | "full" };

// The rows written at once: well under Postgres's limit on parameters.
const ROWS_AT_ONCE = 500;

// Whether a copy of an element replaces the one stored: the whiteboard's own
// rule, so the server keeps what every device's whiteboard would keep.
const newer = (
  copy: { version: number; versionNonce: number },
  stored: { version: number; versionNonce: number } | undefined,
) =>
  !stored ||
  copy.version > stored.version ||
  (copy.version === stored.version && copy.versionNonce < stored.versionNonce);

// Merges the elements one device changed into the board, each kept only if it
// is newer than the stored one, so two devices never stop each other saving.
// Not audited, since it happens every few seconds while drawing.
export async function saveBrainstormElements(
  ownerId: string,
  id: string,
  { elements, since }: BrainstormElementsSave,
): Promise<BrainstormSaveResult> {
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({
        clock: brainstormBoards.clock,
        live: brainstormBoards.live,
        bytes: brainstormBoards.bytes,
      })
      .from(brainstormBoards)
      .where(owned(ownerId, id))
      .for("update");
    if (!board) return { ok: false, reason: "not_found" };
    const behind = board.clock > since;
    if (elements.length === 0) return { ok: true, clock: board.clock, behind };

    const ids = elements.map((element) => element.id);
    const stored = new Map(
      (
        await tx
          .select({
            id: brainstormElements.elementId,
            version: brainstormElements.version,
            versionNonce: brainstormElements.versionNonce,
            deleted: brainstormElements.deleted,
            size: brainstormElements.size,
          })
          .from(brainstormElements)
          .where(
            and(
              eq(brainstormElements.boardId, id),
              inArray(brainstormElements.elementId, ids),
            ),
          )
      ).map((row) => [row.id, row]),
    );

    let live = board.live;
    let bytes = board.bytes;
    const kept = elements.flatMap((element) => {
      const before = stored.get(element.id);
      if (!newer(element, before)) return [];
      const size = Buffer.byteLength(JSON.stringify(element));
      if (before && !before.deleted) {
        live -= 1;
        bytes -= before.size;
      }
      if (!element.isDeleted) {
        live += 1;
        bytes += size;
      }
      return [{ element, size }];
    });
    if (kept.length === 0) return { ok: true, clock: board.clock, behind };
    // A save that leaves the board smaller is let through even past a limit,
    // so a board that is full can always be cleared.
    const growing = live > board.live || bytes > board.bytes;
    if (growing && (live > MAX_BOARD_ELEMENTS || bytes > MAX_BOARD_BYTES)) {
      return { ok: false, reason: "full" };
    }

    const clock = board.clock + 1;
    for (let start = 0; start < kept.length; start += ROWS_AT_ONCE) {
      await tx
        .insert(brainstormElements)
        .values(
          kept.slice(start, start + ROWS_AT_ONCE).map(({ element, size }) => ({
            ownerId,
            boardId: id,
            elementId: element.id,
            version: element.version,
            versionNonce: element.versionNonce,
            deleted: element.isDeleted,
            data: element,
            size,
            clock,
          })),
        )
        .onConflictDoUpdate({
          target: [brainstormElements.boardId, brainstormElements.elementId],
          set: {
            version: sql`excluded.version`,
            versionNonce: sql`excluded.version_nonce`,
            deleted: sql`excluded.deleted`,
            data: sql`excluded.data`,
            size: sql`excluded.size`,
            clock: sql`excluded.clock`,
            updatedAt: sql`now()`,
          },
        });
    }
    await tx
      .update(brainstormBoards)
      // The database's clock, as the board's creation used, so the list's
      // order never depends on this server's.
      .set({ clock, live, bytes, updatedAt: sql`now()` })
      .where(owned(ownerId, id));
    return { ok: true, clock, behind };
  });
}

// The bytes of elements sent in one answer, so a board of any size opens
// without one answer growing past what the hosting will carry.
const PAGE_BYTES = 2_000_000;
const PAGE_ROWS = 5_000;

export type BrainstormChanges =
  | {
      clock: number;
      elements: Record<string, unknown>[];
      // Where the next page starts, if there is one.
      next: string | null;
    }
  // Deleted elements this device was never told of have been cleared away.
  | { reset: true };

// The elements changed since a clock, deleted ones included so a device takes
// them off its whiteboard too; from clock 0, the whole board as it stands.
export async function brainstormChanges(
  ownerId: string,
  id: string,
  { since, after }: BrainstormChangesQuery,
): Promise<BrainstormChanges | null> {
  const [board] = await db
    .select({ clock: brainstormBoards.clock, pruned: brainstormBoards.pruned })
    .from(brainstormBoards)
    .where(owned(ownerId, id));
  if (!board) return null;
  if (since > 0 && since < board.pruned) return { reset: true };

  const rows = await db
    .select({ id: brainstormElements.elementId, data: brainstormElements.data, size: brainstormElements.size })
    .from(brainstormElements)
    .where(
      and(
        eq(brainstormElements.boardId, id),
        since === 0
          ? eq(brainstormElements.deleted, false)
          : gt(brainstormElements.clock, since),
        after ? gt(brainstormElements.elementId, after) : undefined,
      ),
    )
    .orderBy(asc(brainstormElements.elementId))
    .limit(PAGE_ROWS);

  let bytes = 0;
  let taken = 0;
  while (taken < rows.length && (taken === 0 || bytes + rows[taken].size <= PAGE_BYTES)) {
    bytes += rows[taken].size;
    taken += 1;
  }
  const more = taken < rows.length || rows.length === PAGE_ROWS;
  return {
    clock: board.clock,
    elements: rows.slice(0, taken).map(({ data }) => data),
    next: more ? rows[taken - 1].id : null,
  };
}

const KEEP_DELETED = sql`interval '30 days'`;

// Elements deleted long ago are cleared away as the board opens. A device that
// last saw the board before then is told to load it again.
export async function pruneBrainstorm(ownerId: string, id: string) {
  await db.transaction(async (tx) => {
    const [board] = await tx
      .select({ clock: brainstormBoards.clock })
      .from(brainstormBoards)
      .where(owned(ownerId, id))
      .for("update");
    if (!board) return;
    const gone = await tx
      .delete(brainstormElements)
      .where(
        and(
          eq(brainstormElements.boardId, id),
          eq(brainstormElements.deleted, true),
          lt(brainstormElements.updatedAt, sql`now() - ${KEEP_DELETED}`),
        ),
      )
      .returning({ id: brainstormElements.elementId });
    if (gone.length === 0) return;
    await tx
      .update(brainstormBoards)
      .set({ pruned: board.clock })
      .where(owned(ownerId, id));
  });
}
