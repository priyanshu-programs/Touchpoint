import { and, eq, inArray } from "drizzle-orm";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { brainstormVoiceNotes, files } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { brainstormElementsSave } from "./schema";
import { createBrainstorm, deleteBrainstorm, saveBrainstormElements } from "./service";
import {
  MAX_BOARD_VOICE_NOTES,
  MAX_VOICE_BYTES,
  MAX_VOICE_STORED_BYTES,
  VOICE_NOTES_PER_MINUTE,
} from "./voice";
import {
  addVoiceNote,
  countVoiceNotes,
  getVoiceNote,
  openVoiceNotes,
  zipVoiceNotes,
} from "./voice-notes";

const LONG_AGO = new Date(Date.now() - 11 * 60_000);
const refused = (reason: string) => ({ ok: false, reason });

// A WebM recording's first bytes, then `fill` to tell one from another.
const webm = (fill: string, size = 64) =>
  Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
    Buffer.from("webm"),
    Buffer.alloc(size, fill),
  ]);
const mp4 = (fill: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(64, fill)]);

let clock = 1;
const card = (key: string, title: string, over: Record<string, unknown> = {}) => ({
  id: `card-${key}-${title}`,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 300,
  height: 88,
  version: clock++,
  versionNonce: 1,
  isDeleted: false,
  customData: { voice: { key, title, seconds: 12, format: "webm" } },
  ...over,
});

describe("voice notes on a brainstorm board", () => {
  let ownerId: string;
  let boardId: string;

  const board = async (name: string, owner = ownerId) => {
    const created = await createBrainstorm(owner, { name });
    if (!created.ok) throw new Error(created.reason);
    return created.id;
  };
  const draw = (elements: Record<string, unknown>[], id = boardId, owner = ownerId) =>
    saveBrainstormElements(owner, id, brainstormElementsSave.parse({ since: 0, elements }));
  const add = (key: string, bytes: Buffer, id = boardId) =>
    addVoiceNote(ownerId, { boardId: id, key }, bytes);
  const stored = () => db.select({ id: files.id }).from(files).where(eq(files.ownerId, ownerId));
  const age = (keys: string[]) =>
    db
      .update(brainstormVoiceNotes)
      .set({ createdAt: LONG_AGO })
      .where(
        and(eq(brainstormVoiceNotes.boardId, boardId), inArray(brainstormVoiceNotes.fileKey, keys)),
      );
  const seed = async (count: number, id: string, createdAt?: Date) => {
    const [{ id: fileId }] = await db
      .insert(files)
      .values({ ownerId, contentType: "audio/webm", size: 1, sha256: `seed-${id}`, bytes: Buffer.alloc(1) })
      .returning({ id: files.id });
    await db.insert(brainstormVoiceNotes).values(
      Array.from({ length: count }, (_, index) => ({
        ownerId,
        boardId: id,
        fileKey: `seeded-${index}`,
        fileId,
        ...(createdAt && { createdAt }),
      })),
    );
  };

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    boardId = await board("Maple Studio");
  });

  it("keeps a recording as it came, and plays it back", async () => {
    const bytes = webm("a");
    expect(await add("a", bytes)).toEqual({ ok: true });
    expect(await add("a", bytes)).toEqual({ ok: true });
    expect(await getVoiceNote(ownerId, { boardId, key: "a" })).toEqual({
      contentType: "audio/webm",
      bytes,
    });
    expect(await countVoiceNotes(ownerId, boardId)).toBe(1);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "brainstorm.voice_add",
      entityId: boardId,
      after: { contentType: "audio/webm", size: bytes.length },
    });
    expect(await add("b", mp4("b"))).toEqual({ ok: true });
    expect((await getVoiceNote(ownerId, { boardId, key: "b" }))?.contentType).toBe("audio/mp4");
  });

  it("refuses what is not a recording, and one too large", async () => {
    expect(await add("a", Buffer.from("<html><script>alert(1)</script></html>"))).toEqual(
      refused("kind"),
    );
    expect(await add("b", webm("b", MAX_VOICE_BYTES))).toEqual(refused("too_large"));
    expect(await stored()).toEqual([]);
  });

  it("stops at the notes a board can hold, a minute may bring, and the room voice notes have", async () => {
    await seed(MAX_BOARD_VOICE_NOTES, boardId, LONG_AGO);
    expect(await add("a", webm("a"))).toEqual(refused("limit"));

    const other = await board("Other");
    await seed(VOICE_NOTES_PER_MINUTE, other);
    expect(await add("b", webm("b"), other)).toEqual(refused("rate"));

    await resetDatabase();
    ownerId = await createTestOwner();
    boardId = await board("Full");
    const [{ id: fileId }] = await db
      .insert(files)
      .values({
        ownerId,
        contentType: "audio/webm",
        size: MAX_VOICE_STORED_BYTES - 10,
        sha256: "big",
        bytes: Buffer.alloc(1),
      })
      .returning({ id: files.id });
    await db
      .insert(brainstormVoiceNotes)
      .values({ ownerId, boardId, fileKey: "big", fileId, createdAt: LONG_AGO });
    expect(await add("c", webm("c"))).toEqual(refused("full"));
  });

  it("drops a recording no card plays when the board is next opened, but not one just made", async () => {
    await add("kept", webm("a"));
    await add("gone", webm("b"));
    await add("new", webm("c"));
    await draw([card("kept", "Kept")]);
    await age(["kept", "gone"]);

    expect(await openVoiceNotes(ownerId, boardId)).toBe(2);
    expect(await getVoiceNote(ownerId, { boardId, key: "gone" })).toBeNull();
    expect(await stored()).toHaveLength(2);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      actor: "system",
      action: "brainstorm.voice_dropped",
      before: { voiceNotes: 1 },
    });
  });

  it("frees the recordings when the board is deleted", async () => {
    await add("a", webm("a"));
    await deleteBrainstorm(ownerId, boardId);
    expect(await stored()).toEqual([]);
  });

  it("zips every recording a card plays, named 'Board - Heading'", async () => {
    await add("a", webm("a"));
    await add("b", mp4("b"));
    await add("c", webm("c"));
    await add("unshown", webm("d"));
    await draw([
      card("a", "Pricing idea"),
      card("b", "pricing idea"),
      card("c", "Deleted card", { isDeleted: true }),
      card("a", "A copy of the first card"),
    ]);

    const zip = await zipVoiceNotes(ownerId, boardId);
    expect(zip?.name).toBe("Maple Studio - voice notes.zip");
    const inside = unzipSync(zip!.bytes);
    expect(Object.keys(inside).sort()).toEqual([
      "Maple Studio - Pricing idea.webm",
      "Maple Studio - pricing idea.m4a",
    ]);
    expect(Buffer.from(inside["Maple Studio - Pricing idea.webm"])).toEqual(webm("a"));
  });

  it("has no zip for a board with no cards, nor for another owner", async () => {
    await add("a", webm("a"));
    expect(await zipVoiceNotes(ownerId, boardId)).toBeNull();
    await draw([card("a", "Idea")]);

    const stranger = await createTestOwner("stranger@example.com");
    expect(await zipVoiceNotes(stranger, boardId)).toBeNull();
    expect(await getVoiceNote(stranger, { boardId, key: "a" })).toBeNull();
    expect(await addVoiceNote(stranger, { boardId, key: "b" }, webm("b"))).toEqual(
      refused("not_found"),
    );
  });

  it("refuses a card whose heading is empty or too long", () => {
    const save = (title: string) =>
      brainstormElementsSave.safeParse({ since: 0, elements: [card("a", title)] }).success;
    expect(save("Idea")).toBe(true);
    expect(save("  ")).toBe(false);
    expect(save("x".repeat(81))).toBe(false);
  });
});
