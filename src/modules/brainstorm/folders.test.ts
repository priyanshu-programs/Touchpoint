import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { brainstormFolders } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  createBrainstormFolder,
  deleteBrainstormFolder,
  moveBrainstorm,
  renameBrainstormFolder,
} from "./folders";
import {
  getBrainstorm,
  getBrainstormFolder,
  listBrainstormFolders,
  listBrainstorms,
} from "./queries";
import {
  brainstormFolderName,
  brainstormListParams,
  brainstormMove,
  brainstormName,
  MAX_BRAINSTORM_FOLDERS,
} from "./schema";
import { createBrainstorm } from "./service";

const named = (name: string) => brainstormFolderName.parse({ name });

async function board(ownerId: string, name: string, folder: string | null = null) {
  const result = await createBrainstorm(ownerId, brainstormName.parse({ name }), folder);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function folder(ownerId: string, name: string) {
  const result = await createBrainstormFolder(ownerId, named(name));
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

const ids = (page: { rows: { id: string }[] }) => page.rows.map(({ id }) => id);

describe("brainstorm folders", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("makes folders listed by name with how many boards each holds, audited", async () => {
    const work = await folder(ownerId, "Work");
    await folder(ownerId, "art");
    await board(ownerId, "Logo", work);
    await board(ownerId, "Site", work);

    expect(await listBrainstormFolders(ownerId)).toEqual([
      { id: expect.any(String), name: "art", boards: 0 },
      { id: work, name: "Work", boards: 2 },
    ]);
    const { rows } = await listAudit(ownerId);
    expect(
      rows
        .filter(({ action }) => action === "brainstorm_folder.create")
        .map(({ entityId, after }) => [entityId, after]),
    ).toContainEqual([work, { name: "Work" }]);
  });

  it("refuses a folder name already taken, in any case, and past the limit", async () => {
    const id = await folder(ownerId, "Work");
    expect(await createBrainstormFolder(ownerId, named("WORK"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    const other = await folder(ownerId, "Home");
    expect(await renameBrainstormFolder(ownerId, other, named("work"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect(await renameBrainstormFolder(ownerId, id, named("Clients"))).toEqual({ ok: true, id });
    expect((await getBrainstormFolder(ownerId, id))?.name).toBe("Clients");

    await db.insert(brainstormFolders).values(
      Array.from({ length: MAX_BRAINSTORM_FOLDERS - 2 }, (_, n) => ({ ownerId, name: `F${n}` })),
    );
    expect(await createBrainstormFolder(ownerId, named("One more"))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("shows loose boards on the page and a folder's boards inside it", async () => {
    const work = await folder(ownerId, "Work");
    const loose = await board(ownerId, "Loose");
    const inside = await board(ownerId, "Inside", work);

    expect(ids(await listBrainstorms(ownerId))).toEqual([loose]);
    expect(ids(await listBrainstorms(ownerId, { folder: work }))).toEqual([inside]);
    // A search on the page looks in every folder too, and says which.
    const found = await listBrainstorms(ownerId, { q: "i" });
    expect(found.rows.find(({ id }) => id === inside)?.folderName).toBe("Work");
  });

  it("moves a board into a folder, first in it, and out again, keeping Last edited", async () => {
    const work = await folder(ownerId, "Work");
    const there = await board(ownerId, "There", work);
    const id = await board(ownerId, "Ideas");
    const edited = (await getBrainstorm(ownerId, id))!.updatedAt.getTime();

    expect(await moveBrainstorm(ownerId, { boardId: id, folderId: work })).toBe(true);
    expect(ids(await listBrainstorms(ownerId, { folder: work }))).toEqual([id, there]);
    expect(ids(await listBrainstorms(ownerId))).toEqual([]);
    expect((await getBrainstorm(ownerId, id))!.updatedAt.getTime()).toBe(edited);

    expect(await moveBrainstorm(ownerId, { boardId: id, folderId: null })).toBe(true);
    expect(ids(await listBrainstorms(ownerId))).toEqual([id]);
    const { rows } = await listAudit(ownerId);
    expect(rows.filter(({ action }) => action === "brainstorm.move")).toHaveLength(2);
  });

  it("puts a folder's boards back on the page when it is deleted", async () => {
    const work = await folder(ownerId, "Work");
    const id = await board(ownerId, "Ideas", work);

    expect(await deleteBrainstormFolder(ownerId, work)).toBe(true);
    expect(await getBrainstormFolder(ownerId, work)).toBeNull();
    expect((await getBrainstorm(ownerId, id))?.folderId).toBeNull();
    expect(ids(await listBrainstorms(ownerId))).toEqual([id]);
    expect(await deleteBrainstormFolder(ownerId, work)).toBe(false);
  });

  it("never reaches another owner's folder or board", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    const mine = await folder(ownerId, "Work");
    const myBoard = await board(ownerId, "Ideas");
    const theirs = await folder(stranger, "Theirs");
    const theirBoard = await board(stranger, "Their board");

    // Not into a stranger's folder, and not a stranger's board into mine.
    expect(await moveBrainstorm(ownerId, { boardId: myBoard, folderId: theirs })).toBe(false);
    expect(await moveBrainstorm(ownerId, { boardId: theirBoard, folderId: mine })).toBe(false);
    expect(await moveBrainstorm(stranger, { boardId: myBoard, folderId: theirs })).toBe(false);
    expect(await createBrainstorm(ownerId, brainstormName.parse({ name: "X" }), theirs)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await renameBrainstormFolder(stranger, mine, named("Mine"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteBrainstormFolder(stranger, mine)).toBe(false);
    expect(await getBrainstormFolder(stranger, mine)).toBeNull();
    expect(await listBrainstormFolders(stranger)).toEqual([
      { id: theirs, name: "Theirs", boards: 0 },
    ]);
    expect((await getBrainstorm(ownerId, myBoard))?.folderId).toBeNull();
  });

  it("checks names, moves and the folder in the address", () => {
    expect(brainstormFolderName.safeParse({ name: "  " }).success).toBe(false);
    expect(brainstormFolderName.safeParse({ name: "x".repeat(101) }).success).toBe(false);
    expect(brainstormMove.safeParse({ boardId: "nope", folderId: null }).success).toBe(false);
    expect(
      brainstormMove.safeParse({ boardId: crypto.randomUUID(), folderId: "nope" }).success,
    ).toBe(false);
    expect(brainstormListParams.parse({ folder: "not-a-uuid" }).folder).toBeUndefined();
  });
});
