import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { brainstormBoards } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import {
  MAX_BRAINSTORM_BOARDS,
  type BrainstormIcon,
  type BrainstormName,
  type BrainstormSceneSave,
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
  | { ok: true; version: number }
  | { ok: false; reason: "not_found" | "conflict" };

// As a workflow's drawing is saved: only from the version the whiteboard
// loaded, and not audited, since it happens every few seconds while drawing.
export async function saveBrainstormScene(
  ownerId: string,
  id: string,
  { version, elements }: BrainstormSceneSave,
): Promise<BrainstormSaveResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ version: brainstormBoards.version })
      .from(brainstormBoards)
      .where(owned(ownerId, id))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };
    if (before.version !== version) return { ok: false, reason: "conflict" };

    await tx
      .update(brainstormBoards)
      // The database's clock, as the board's creation used, so the list's
      // order never depends on this server's.
      .set({ scene: { elements }, version: version + 1, updatedAt: sql`now()` })
      .where(owned(ownerId, id));
    return { ok: true, version: version + 1 };
  });
}
