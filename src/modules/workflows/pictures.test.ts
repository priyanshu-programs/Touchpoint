import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contacts, files, organizations, workflowPictures } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { deleteContact } from "@/modules/contacts/service";
import { MAX_STORED_BYTES } from "@/modules/files/service";
import { deleteOrganization } from "@/modules/organizations/service";
import { pdf } from "@/test/files";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { grainy, shape, solid } from "@/test/pictures";
import { addFile, openAttachments, removeAttachment } from "./attachments";
import { createBoard, deleteBoard, saveScene, startBoard } from "./boards";
import { MAX_FILE_BYTES, MAX_PICTURE_SIDE } from "./drawing";
import { addPicture, getPicture, openPictures, picturesOf } from "./pictures";
import {
  MAX_BOARD_PICTURES,
  pictureRef,
  PICTURES_PER_MINUTE,
  sceneSave,
} from "./schema";

const box = { id: "box", type: "rectangle", x: 0, y: 0, width: 100, height: 60 };
const shown = (key: string) => ({ id: `on-${key}`, type: "image", fileId: key });
const refused = (reason: string) => ({ ok: false, reason });
const LONG_AGO = new Date(Date.now() - 11 * 60_000);

describe("pictureRef", () => {
  const boardId = crypto.randomUUID();

  it("names a picture by a board and the whiteboard's id for it", () => {
    for (const key of ["9f86d081884c7d659a2feaa0c55ad015a3bf4f1b", "Ab_-9"]) {
      expect(pictureRef.safeParse({ boardId, key }).success).toBe(true);
    }
  });

  it.each([
    ["no id", ""],
    ["an id over 64 characters", "a".repeat(65)],
    ["an id that is a path", "../scene"],
    ["an id with a space", "a b"],
  ])("refuses %s", (_label, key) => {
    expect(pictureRef.safeParse({ boardId, key }).success).toBe(false);
  });

  it("refuses a board that is not an id, and anything more", () => {
    expect(pictureRef.safeParse({ boardId: "1", key: "a" }).success).toBe(false);
    expect(pictureRef.safeParse({ boardId, key: "a", ownerId: "x" }).success).toBe(
      false,
    );
  });
});

describe("picturesOf", () => {
  it("lists the pictures a drawing shows, each once", () => {
    expect([
      ...picturesOf([shown("a"), { ...shown("a"), id: "again" }, shown("b"), box]),
    ]).toEqual(["a", "b"]);
    expect(picturesOf([{ id: "x", type: "image" }, { ...box, fileId: "a" }]).size).toBe(0);
  });
});

describe("pictures on a board", () => {
  let ownerId: string;
  let boardId: string;

  // A workflow whose stored drawing shows the pictures under those ids.
  const drawn = async (name: string, keys: string[], owner = ownerId) => {
    const created = await createBoard(owner, { name, description: null });
    if (!created.ok) throw new Error(created.reason);
    await saveScene(
      owner,
      created.id,
      sceneSave.parse({ version: 1, elements: [box, ...keys.map(shown)] }),
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
    db.select({ id: files.id, size: files.size }).from(files).where(eq(files.ownerId, ownerId));
  // Makes pictures look as if they were stored a while back.
  const age = (keys: string[], id = boardId) =>
    db
      .update(workflowPictures)
      .set({ createdAt: LONG_AGO })
      .where(
        and(eq(workflowPictures.boardId, id), inArray(workflowPictures.fileKey, keys)),
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
    boardId = await drawn("Onboarding", ["a"]);
  });

  it("stores a picture as WebP, no larger than the whiteboard shows it and without what its file said", async () => {
    const photo = await sharp(await grainy("jpeg", 2000, 1000))
      .withExif({ IFD0: { Copyright: "Someone" } })
      .toBuffer();
    expect((await shape(photo)).exif).toBe(true);

    expect(await add("a", photo)).toEqual({ ok: true });
    const kept = await getPicture(ownerId, { boardId, key: "a" });
    expect(kept?.contentType).toBe("image/webp");
    expect(await shape(kept!.bytes)).toMatchObject({
      format: "webp",
      width: MAX_PICTURE_SIDE,
      height: MAX_PICTURE_SIDE / 2,
      exif: false,
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.picture_add",
      entityId: boardId,
      after: { contentType: "image/webp", size: kept!.bytes.length },
    });
  });

  it("leaves a small picture the size it is, see-through where it was", async () => {
    await add("a", await solid("png", 300, 200, { r: 0, g: 0, b: 0, alpha: 0 }));
    const kept = await getPicture(ownerId, { boardId, key: "a" });
    expect(await shape(kept!.bytes)).toMatchObject({
      format: "webp",
      width: 300,
      height: 200,
      hasAlpha: true,
    });
  });

  it("keeps a picture once under its id, whatever is sent under it again", async () => {
    const first = await solid("png", 40, 40);
    await add("a", first);
    const before = await getPicture(ownerId, { boardId, key: "a" });
    expect(await add("a", await solid("png", 80, 80, "#3333cc"))).toEqual({ ok: true });
    expect(await held()).toEqual(["a"]);
    expect(await stored()).toHaveLength(1);
    const after = await getPicture(ownerId, { boardId, key: "a" });
    expect(after?.bytes.equals(before!.bytes)).toBe(true);
  });

  it("stores the same picture once, on however many boards", async () => {
    const other = await drawn("Offboarding", ["z"]);
    const logo = await solid("png", 40, 40);
    await add("a", logo);
    await add("b", logo);
    await add("z", logo, other);
    await add("c", await solid("png", 40, 40, "#3333cc"));
    expect(await stored()).toHaveLength(2);
  });

  it.each([
    ["a drawing that could carry script", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["a PDF", pdf()],
    ["text", Buffer.from("only text")],
    ["an icon file", Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10])],
    ["a picture cut short", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
  ])("does not keep %s", async (_label, bytes) => {
    expect(await add("a", bytes)).toEqual(refused("kind"));
    expect(await stored()).toEqual([]);
    expect(await getPicture(ownerId, { boardId, key: "a" })).toBeNull();
  });

  it("refuses a picture over the size one may be", async () => {
    const large = Buffer.concat([
      await solid("png", 40, 40),
      Buffer.alloc(MAX_FILE_BYTES),
    ]);
    expect(await add("a", large)).toEqual(refused("too_large"));
    expect(await stored()).toEqual([]);
  });

  it("stops at the pictures a whiteboard can hold", async () => {
    const fileId = await filler();
    await db.insert(workflowPictures).values(
      Array.from({ length: MAX_BOARD_PICTURES }, (_, index) => ({
        ownerId,
        boardId,
        fileKey: `seeded-${index}`,
        fileId,
        createdAt: LONG_AGO,
      })),
    );
    expect(await add("a", await solid("png", 40, 40))).toEqual(refused("limit"));
    // One the board already has is not one more.
    expect(await add("seeded-0", await solid("png", 40, 40))).toEqual({ ok: true });
  });

  it("stops at the room an owner's files may take", async () => {
    await db.insert(files).values({
      ownerId,
      contentType: "application/pdf",
      size: MAX_STORED_BYTES - 10,
      sha256: "filler",
      bytes: Buffer.alloc(1),
    });
    expect(await add("a", await solid("png", 40, 40))).toEqual(refused("full"));
    expect(await held()).toEqual([]);
  });

  it("stops at the pictures a minute may hold", async () => {
    const fileId = await filler();
    const other = await drawn("Offboarding", []);
    await db.insert(workflowPictures).values(
      Array.from({ length: PICTURES_PER_MINUTE }, (_, index) => ({
        ownerId,
        boardId: other,
        fileKey: `seeded-${index}`,
        fileId,
      })),
    );
    expect(await add("a", await solid("png", 40, 40))).toEqual(refused("rate"));
  });

  it("drops a picture nothing shows when the whiteboard is next opened, but not one just stored", async () => {
    await add("a", await solid("png", 40, 40));
    await add("gone", await solid("png", 40, 40, "#33cc33"));
    await add("new", await solid("png", 40, 40, "#3333cc"));
    await age(["a", "gone"]);

    expect(await held()).toEqual(["a", "new"]);
    expect(await stored()).toHaveLength(2);
    expect(await getPicture(ownerId, { boardId, key: "gone" })).toBeNull();
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      actor: "system",
      action: "workflow.pictures_dropped",
      entityId: boardId,
      before: { pictures: 1 },
    });
  });

  it("keeps a deleted picture until the whiteboard is opened again", async () => {
    await add("a", await solid("png", 40, 40));
    await age(["a"]);
    // The picture is deleted on the whiteboard and the drawing saved.
    await saveScene(ownerId, boardId, sceneSave.parse({ version: 2, elements: [box] }));
    // Nothing goes with the save: an undo could still bring the picture back.
    expect(await getPicture(ownerId, { boardId, key: "a" })).not.toBeNull();

    expect(await held()).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it("frees a file only when neither a box nor a picture points at it", async () => {
    await add("a", await solid("png", 40, 40));
    const { bytes } = (await getPicture(ownerId, { boardId, key: "a" }))!;
    // The stored picture is also put on a box as a file: the same bytes, once.
    const attached = await addFile(
      ownerId,
      { boardId, elementId: "box" },
      { name: "logo.webp", bytes },
    );
    if (!attached.ok) throw new Error(attached.reason);
    expect(await stored()).toHaveLength(1);

    await removeAttachment(ownerId, {
      boardId,
      attachmentId: attached.attachments[0].id,
    });
    expect(await stored()).toHaveLength(1);
    expect(await getPicture(ownerId, { boardId, key: "a" })).not.toBeNull();

    // And the other way round: the picture goes, the file on the box stays.
    await addFile(ownerId, { boardId, elementId: "box" }, { name: "logo.webp", bytes });
    await age(["a"]);
    await saveScene(ownerId, boardId, sceneSave.parse({ version: 2, elements: [box] }));
    expect(await held()).toEqual([]);
    expect(await stored()).toHaveLength(1);
    expect(await openAttachments(ownerId, boardId)).toHaveLength(1);
  });

  describe("on a company and a person", () => {
    let organizationId: string;
    let contactId: string;

    const start = async (subject: Parameters<typeof startBoard>[1]) => {
      const started = await startBoard(ownerId, subject, { templateId: boardId });
      if (!started.ok) throw new Error(started.reason);
      return started.id;
    };

    beforeEach(async () => {
      [{ id: organizationId }] = await db
        .insert(organizations)
        .values({ ownerId, name: "Acme" })
        .returning({ id: organizations.id });
      [{ id: contactId }] = await db
        .insert(contacts)
        .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
        .returning({ id: contacts.id });
      await add("a", await solid("png", 40, 40));
    });

    it("copies the pictures a workflow shows without storing one again", async () => {
      // A picture the drawing no longer shows is not copied.
      await add("unshown", await solid("png", 40, 40, "#33cc33"));
      const copy = await start({ organizationId });

      expect(await held(copy)).toEqual(["a"]);
      expect(await stored()).toHaveLength(2);
      const [ours, theirs] = await Promise.all(
        [boardId, copy].map((id) => getPicture(ownerId, { boardId: id, key: "a" })),
      );
      expect(theirs?.bytes.equals(ours!.bytes)).toBe(true);
    });

    it("keeps a copy and its workflow apart", async () => {
      const copy = await start({ organizationId });
      const sibling = await start({ contactId });
      await saveScene(
        ownerId,
        copy,
        sceneSave.parse({ version: 1, elements: [box, shown("b")] }),
      );
      await add("b", await solid("png", 40, 40, "#3333cc"), copy);
      await age(["a", "b"], copy);

      expect(await held(copy)).toEqual(["b"]);
      expect(await held()).toEqual(["a"]);
      expect(await held(sibling)).toEqual(["a"]);

      // The workflow goes; the picture its copies still show stays.
      await deleteBoard(ownerId, boardId);
      expect(await getPicture(ownerId, { boardId: sibling, key: "a" })).not.toBeNull();
      expect(await stored()).toHaveLength(2);
    });

    it("frees a picture when its last board goes, by itself or with its record", async () => {
      const onCompany = await start({ organizationId });
      await start({ contactId });
      await add("only", await solid("png", 40, 40, "#3333cc"), onCompany);
      expect(await stored()).toHaveLength(2);

      await deleteOrganization(ownerId, organizationId);
      expect(await stored()).toHaveLength(1);
      await deleteBoard(ownerId, boardId);
      expect(await stored()).toHaveLength(1);
      await deleteContact(ownerId, contactId);
      expect(await stored()).toEqual([]);
    });
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
    // Nor by way of a board of their own.
    const theirs = await drawn("Theirs", ["a"], stranger);
    expect(await getPicture(stranger, { boardId: theirs, key: "a" })).toBeNull();
    expect(await held()).toEqual(["a"]);

    // The same picture is a file of their own for another owner.
    await addPicture(stranger, { boardId: theirs, key: "a" }, logo);
    expect(await db.select({ id: files.id }).from(files)).toHaveLength(2);
  });
});
