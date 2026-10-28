import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { brainstormPictures, files } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createBoard, deleteBoard, saveScene } from "@/modules/workflows/boards";
import { MAX_PICTURE_SIDE } from "@/modules/workflows/drawing";
import * as workflowPictures from "@/modules/workflows/pictures";
import {
  MAX_BOARD_PICTURES,
  PICTURES_PER_MINUTE,
  sceneSave,
} from "@/modules/workflows/schema";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { grainy, shape, solid } from "@/test/pictures";
import { addPicture, getPicture, openPictures } from "./pictures";
import { brainstormElementsSave } from "./schema";
import { createBrainstorm, deleteBrainstorm, saveBrainstormElements } from "./service";

const saved = { version: 1, versionNonce: 1, isDeleted: false };
const box = { id: "box", type: "rectangle", x: 0, y: 0, width: 200, height: 200, ...saved };
const shown = (key: string) => ({ id: `on-${key}`, type: "image", fileId: key, ...saved });
const refused = (reason: string) => ({ ok: false, reason });
const LONG_AGO = new Date(Date.now() - 11 * 60_000);

describe("pictures on a brainstorm board", () => {
  let ownerId: string;
  let boardId: string;

  // A brainstorm board whose stored drawing shows the pictures under those ids.
  const drawn = async (name: string, keys: string[], owner = ownerId) => {
    const created = await createBrainstorm(owner, { name });
    if (!created.ok) throw new Error(created.reason);
    await saveBrainstormElements(
      owner,
      created.id,
      brainstormElementsSave.parse({ since: 0, elements: [box, ...keys.map(shown)] }),
    );
    return created.id;
  };

  const add = (key: string, bytes: Buffer, id = boardId) =>
    addPicture(ownerId, { boardId: id, key }, bytes);
  const held = async (id = boardId) => {
    const keys = await openPictures(ownerId, id);
    if (!keys) throw new Error("no board");
    return keys.sort();
  };
  const stored = () =>
    db.select({ id: files.id }).from(files).where(eq(files.ownerId, ownerId));
  const age = (keys: string[], id = boardId) =>
    db
      .update(brainstormPictures)
      .set({ createdAt: LONG_AGO })
      .where(
        and(eq(brainstormPictures.boardId, id), inArray(brainstormPictures.fileKey, keys)),
      );
  const filler = async () => {
    const [{ id }] = await db
      .insert(files)
      .values({
        ownerId,
        contentType: "image/webp",
        size: 1,
        sha256: "seeded",
        bytes: Buffer.alloc(1),
      })
      .returning({ id: files.id });
    return id;
  };

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    boardId = await drawn("Ideas", ["a"]);
  });

  it("stores a picture as WebP, no larger than the whiteboard shows it", async () => {
    expect(await add("a", await grainy("jpeg", 2000, 1000))).toEqual({ ok: true });
    const kept = await getPicture(ownerId, { boardId, key: "a" });
    expect(kept?.contentType).toBe("image/webp");
    expect(await shape(kept!.bytes)).toMatchObject({
      format: "webp",
      width: MAX_PICTURE_SIDE,
      height: MAX_PICTURE_SIDE / 2,
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "brainstorm.picture_add",
      entityType: "brainstorm",
      entityId: boardId,
      after: { contentType: "image/webp", size: kept!.bytes.length },
    });
  });

  it("does not keep a drawing that could carry script", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(await add("a", svg)).toEqual(refused("kind"));
    expect(await stored()).toEqual([]);
  });

  it("stops at the pictures a board can hold, and at the pictures a minute may hold", async () => {
    const fileId = await filler();
    await db.insert(brainstormPictures).values(
      Array.from({ length: MAX_BOARD_PICTURES }, (_, index) => ({
        ownerId,
        boardId,
        fileKey: `seeded-${index}`,
        fileId,
        createdAt: LONG_AGO,
      })),
    );
    expect(await add("a", await solid("png", 40, 40))).toEqual(refused("limit"));

    const other = await drawn("Other", []);
    await db.insert(brainstormPictures).values(
      Array.from({ length: PICTURES_PER_MINUTE }, (_, index) => ({
        ownerId,
        boardId: other,
        fileKey: `recent-${index}`,
        fileId,
      })),
    );
    expect(await add("b", await solid("png", 40, 40), other)).toEqual(refused("rate"));
  });

  it("drops a picture nothing shows when the board is next opened, but not one just stored", async () => {
    await add("a", await solid("png", 40, 40));
    await add("gone", await solid("png", 40, 40, "#33cc33"));
    await add("new", await solid("png", 40, 40, "#3333cc"));
    await age(["a", "gone"]);

    expect(await held()).toEqual(["a", "new"]);
    expect(await stored()).toHaveLength(2);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      actor: "system",
      action: "brainstorm.pictures_dropped",
      entityId: boardId,
      before: { pictures: 1 },
    });
  });

  it("frees a picture's file when its board is deleted", async () => {
    await add("a", await solid("png", 40, 40));
    expect(await stored()).toHaveLength(1);
    await deleteBrainstorm(ownerId, boardId);
    expect(await stored()).toEqual([]);
  });

  it("keeps a file a workflow and a brainstorm board share until neither shows it", async () => {
    const logo = await solid("png", 40, 40);
    const workflow = await createBoard(ownerId, { name: "Onboarding", description: null });
    if (!workflow.ok) throw new Error(workflow.reason);
    await saveScene(
      ownerId,
      workflow.id,
      sceneSave.parse({ version: 1, elements: [box, shown("w")] }),
    );
    await workflowPictures.addPicture(ownerId, { boardId: workflow.id, key: "w" }, logo);
    await add("a", logo);
    expect(await stored()).toHaveLength(1);

    await deleteBoard(ownerId, workflow.id);
    expect(await getPicture(ownerId, { boardId, key: "a" })).not.toBeNull();
    expect(await stored()).toHaveLength(1);

    // And the other way round.
    const again = await createBoard(ownerId, { name: "Again", description: null });
    if (!again.ok) throw new Error(again.reason);
    await workflowPictures.addPicture(ownerId, { boardId: again.id, key: "w" }, logo);
    await deleteBrainstorm(ownerId, boardId);
    expect(
      await workflowPictures.getPicture(ownerId, { boardId: again.id, key: "w" }),
    ).not.toBeNull();
    expect(await stored()).toHaveLength(1);
  });

  it("keeps a brainstorm board's pictures and a workflow's apart", async () => {
    await add("a", await solid("png", 40, 40));
    const workflow = await createBoard(ownerId, { name: "Onboarding", description: null });
    if (!workflow.ok) throw new Error(workflow.reason);
    // A workflow named by a brainstorm board's id, or the other way round, finds nothing.
    expect(await workflowPictures.getPicture(ownerId, { boardId, key: "a" })).toBeNull();
    expect(await openPictures(ownerId, workflow.id)).toBeNull();
    expect(await add("b", await solid("png", 40, 40), workflow.id)).toEqual(
      refused("not_found"),
    );
  });

  it("keeps another owner away from a board and its pictures", async () => {
    const logo = await solid("png", 40, 40);
    await add("a", logo);
    const stranger = await createTestOwner("stranger@example.com");

    expect(await openPictures(stranger, boardId)).toBeNull();
    expect(await addPicture(stranger, { boardId, key: "b" }, logo)).toEqual(
      refused("not_found"),
    );
    expect(await getPicture(stranger, { boardId, key: "a" })).toBeNull();
    const theirs = await drawn("Theirs", ["a"], stranger);
    expect(await getPicture(stranger, { boardId: theirs, key: "a" })).toBeNull();
    expect(await held()).toEqual(["a"]);
  });
});
