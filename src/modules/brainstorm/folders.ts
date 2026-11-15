import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { brainstormBoards, brainstormFolders } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import {
  MAX_BRAINSTORM_FOLDERS,
  type BrainstormFolderName,
  type BrainstormMove,
} from "./schema";

export type BrainstormFolderResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limit" | "name_taken" | "not_found" };

const ownedFolder = (ownerId: string, id: string) =>
  and(eq(brainstormFolders.ownerId, ownerId), eq(brainstormFolders.id, id));

// The same lock as the boards', so two folders named at once cannot both take a
// name, and a folder is not deleted while a board is being moved into it.
const lockOwner = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`brainstorm:${ownerId}`}))`);

// The name is citext, so this compares without regard to case.
async function folderNameTaken(tx: Tx, ownerId: string, name: string, except?: string) {
  const [row] = await tx
    .select({ id: brainstormFolders.id })
    .from(brainstormFolders)
    .where(
      and(
        eq(brainstormFolders.ownerId, ownerId),
        eq(brainstormFolders.name, name),
        except ? ne(brainstormFolders.id, except) : undefined,
      ),
    );
  return Boolean(row);
}

// Whether a folder is the owner's, for a board being made or moved into it.
export async function folderOwned(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({ id: brainstormFolders.id })
    .from(brainstormFolders)
    .where(ownedFolder(ownerId, id));
  return Boolean(row);
}

export async function createBrainstormFolder(
  ownerId: string,
  { name }: BrainstormFolderName,
): Promise<BrainstormFolderResult> {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const count = await tx.$count(brainstormFolders, eq(brainstormFolders.ownerId, ownerId));
    if (count >= MAX_BRAINSTORM_FOLDERS) return { ok: false, reason: "limit" };
    if (await folderNameTaken(tx, ownerId, name)) return { ok: false, reason: "name_taken" };

    const [row] = await tx
      .insert(brainstormFolders)
      .values({ ownerId, name })
      .returning({ id: brainstormFolders.id });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm_folder.create",
      entityType: "brainstorm_folder",
      entityId: row.id,
      after: { name },
    });
    return { ok: true, id: row.id };
  });
}

export async function renameBrainstormFolder(
  ownerId: string,
  id: string,
  { name }: BrainstormFolderName,
): Promise<BrainstormFolderResult> {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const [before] = await tx
      .select({ name: brainstormFolders.name })
      .from(brainstormFolders)
      .where(ownedFolder(ownerId, id))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };
    if (await folderNameTaken(tx, ownerId, name, id)) {
      return { ok: false, reason: "name_taken" };
    }

    await tx
      .update(brainstormFolders)
      .set({ name, updatedAt: sql`now()` })
      .where(ownedFolder(ownerId, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm_folder.rename",
      entityType: "brainstorm_folder",
      entityId: id,
      before: { name: before.name },
      after: { name },
    });
    return { ok: true, id };
  });
}

// The boards inside go back onto the Brainstorming page; none is deleted.
export async function deleteBrainstormFolder(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const boards = await tx.$count(
      brainstormBoards,
      and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.folderId, id)),
    );
    const [before] = await tx
      .delete(brainstormFolders)
      .where(ownedFolder(ownerId, id))
      .returning({ name: brainstormFolders.name });
    if (!before) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm_folder.delete",
      entityType: "brainstorm_folder",
      entityId: id,
      before: { name: before.name, boards },
    });
    return true;
  });
}

// Puts a board in a folder, first in it, or takes it out onto the Brainstorming
// page. Moving a board is not editing it, so its "Last edited" stays.
export async function moveBrainstorm(ownerId: string, { boardId, folderId }: BrainstormMove) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const [before] = await tx
      .select({ folderId: brainstormBoards.folderId })
      .from(brainstormBoards)
      .where(and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, boardId)))
      .for("update");
    if (!before) return false;
    if (folderId && !(await folderOwned(tx, ownerId, folderId))) return false;
    if (before.folderId === folderId) return true;

    const [{ first }] = await tx
      .select({ first: sql<number>`coalesce(min(${brainstormBoards.position}), 0)` })
      .from(brainstormBoards)
      .where(eq(brainstormBoards.ownerId, ownerId));
    await tx
      .update(brainstormBoards)
      .set({
        folderId,
        position: first - 1,
        updatedAt: sql`${brainstormBoards.updatedAt}`,
      })
      .where(and(eq(brainstormBoards.ownerId, ownerId), eq(brainstormBoards.id, boardId)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "brainstorm.move",
      entityType: "brainstorm",
      entityId: boardId,
      before: { folderId: before.folderId },
      after: { folderId },
    });
    return true;
  });
}
