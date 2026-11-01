import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { brainstormBoards, brainstormElements } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getBrainstorm, listBrainstorms } from "./queries";
import {
  BRAINSTORM_PAGE_SIZE,
  brainstormIcon,
  brainstormElementsSave,
  brainstormName,
  brainstormOrder,
  MAX_BOARD_ELEMENTS,
  MAX_BRAINSTORM_BOARDS,
} from "./schema";
import {
  brainstormChanges,
  createBrainstorm,
  deleteBrainstorm,
  reorderBrainstorms,
  pruneBrainstorm,
  renameBrainstorm,
  saveBrainstormElements,
  setBrainstormIcon,
} from "./service";

const named = (name: string) => brainstormName.parse({ name });
const box = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  version: 1,
  versionNonce: 5,
  isDeleted: false,
  ...more,
});
const save = (since: number, elements: unknown[]) =>
  brainstormElementsSave.parse({ since, elements });
// The board as a device opening it is given it, by id.
async function drawing(ownerId: string, id: string) {
  const changes = await brainstormChanges(ownerId, id, { since: 0 });
  if (!changes || "reset" in changes) throw new Error("no drawing");
  return Object.fromEntries(changes.elements.map((element) => [element.id, element]));
}

async function made(ownerId: string, name: string) {
  const result = await createBrainstorm(ownerId, named(name));
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

describe("brainstormName", () => {
  it("trims the name and refuses an empty one or anything else sent", () => {
    expect(named("  Ideas ")).toEqual({ name: "Ideas" });
    expect(brainstormName.safeParse({ name: " " }).success).toBe(false);
    expect(brainstormName.safeParse({ name: "x".repeat(101) }).success).toBe(false);
    expect(brainstormName.safeParse({ name: "Ideas", ownerId: "x" }).success).toBe(false);
  });
});

describe("brainstormElementsSave", () => {
  it("keeps how an element is drawn and drops any whiteboard data on it", () => {
    const [kept] = save(1, [
      box("a", {
        backgroundColor: "#fff3a3",
        customData: { stage: { status: "done" } },
      }),
    ]).elements;
    expect(kept).toMatchObject({ id: "a", backgroundColor: "#fff3a3" });
    expect(kept).not.toHaveProperty("customData");
  });

  it("keeps a sticky note's mark and nothing else beside it", () => {
    const [note, both, other] = save(1, [
      box("a", { customData: { sticky: true } }),
      box("b", { customData: { sticky: true, stage: { status: "done" } } }),
      box("c", { customData: { sticky: "yes" } }),
    ]).elements;
    expect(note.customData).toEqual({ sticky: true });
    expect(both.customData).toEqual({ sticky: true });
    expect(other).not.toHaveProperty("customData");
  });

  it("refuses embedded pages, pictures with no stored id, unknown envelope fields, an element twice and one with no version", () => {
    const passes = (value: unknown) => brainstormElementsSave.safeParse(value).success;
    expect(passes({ since: 1, elements: [box("a", { type: "iframe" })] })).toBe(false);
    expect(passes({ since: 1, elements: [box("a", { type: "embeddable" })] })).toBe(false);
    expect(passes({ since: 1, elements: [box("a", { type: "image" })] })).toBe(false);
    expect(passes({ since: 1, elements: [], files: {} })).toBe(false);
    expect(passes({ since: 1, elements: [box("a"), box("a")] })).toBe(false);
    expect(passes({ since: 1, elements: [box("a", { version: undefined })] })).toBe(false);
    expect(passes({ since: 1, elements: [box("a", { versionNonce: 2 ** 31 })] })).toBe(false);
  });

  it("drops a link that is not a web address", () => {
    const [bad, good] = save(1, [
      box("a", { link: "javascript:alert(1)" }),
      box("b", { link: "https://example.com" }),
    ]).elements;
    expect(bad.link).toBeNull();
    expect(good.link).toBe("https://example.com");
  });
});

describe("brainstorm boards", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("makes a board with an empty drawing, audited", async () => {
    const id = await made(ownerId, "Q3 ideas");
    const board = await getBrainstorm(ownerId, id);
    expect(board).toMatchObject({ name: "Q3 ideas", clock: 0, icon: null });
    expect(await drawing(ownerId, id)).toEqual({});
    const { rows: entries } = await listAudit(ownerId);
    expect(entries.map(({ action }) => action)).toContain("brainstorm.create");
  });

  it("tells boards apart by name without regard to case", async () => {
    const id = await made(ownerId, "Ideas");
    expect(await createBrainstorm(ownerId, named("ideas"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    const other = await made(ownerId, "Sketches");
    expect(await renameBrainstorm(ownerId, other, named("IDEAS"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    // A board keeps its own name in another case.
    expect(await renameBrainstorm(ownerId, id, named("IDEAS"))).toEqual({ ok: true, id });
    expect((await getBrainstorm(ownerId, id))!.name).toBe("IDEAS");
  });

  it(`holds at most ${MAX_BRAINSTORM_BOARDS} boards an owner`, async () => {
    await db.insert(brainstormBoards).values(
      Array.from({ length: MAX_BRAINSTORM_BOARDS }, (_, index) => ({
        ownerId,
        name: `Board ${index}`,
      })),
    );
    expect(await createBrainstorm(ownerId, named("One more"))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("merges what two devices save, element by element, by the whiteboard's own rule", async () => {
    const id = await made(ownerId, "Ideas");
    expect(await saveBrainstormElements(ownerId, id, save(0, [box("a"), box("b")]))).toEqual({
      ok: true,
      clock: 1,
      behind: false,
    });
    // A second device, still at clock 0: its own element is kept beside them,
    // and it is told it has missed a save.
    expect(await saveBrainstormElements(ownerId, id, save(0, [box("c")]))).toEqual({
      ok: true,
      clock: 2,
      behind: true,
    });
    await saveBrainstormElements(ownerId, id, save(2, [
      // A higher version wins.
      box("a", { version: 2, x: 10 }),
      // The same version wins only with a lower nonce.
      box("b", { versionNonce: 9, x: 20 }),
      box("c", { versionNonce: 1, x: 30 }),
    ]));
    // An older copy changes nothing, and is no change to the board's clock.
    expect(await saveBrainstormElements(ownerId, id, save(3, [box("a", { x: 99 })]))).toEqual({
      ok: true,
      clock: 3,
      behind: false,
    });
    const now = await drawing(ownerId, id);
    expect([now.a.x, now.b.x, now.c.x]).toEqual([10, 0, 30]);
  });

  it("deletes an element as a mark an older copy cannot undo, and tells a device what changed since its clock", async () => {
    const id = await made(ownerId, "Ideas");
    await saveBrainstormElements(ownerId, id, save(0, [box("a"), box("b")]));
    await saveBrainstormElements(ownerId, id, save(1, [box("a", { version: 2, isDeleted: true })]));
    await saveBrainstormElements(ownerId, id, save(2, [box("a")]));
    expect(Object.keys(await drawing(ownerId, id))).toEqual(["b"]);
    const changes = await brainstormChanges(ownerId, id, { since: 1 });
    expect(changes).toMatchObject({ clock: 2, next: null });
    expect(changes && "elements" in changes && changes.elements).toEqual([
      expect.objectContaining({ id: "a", isDeleted: true }),
    ]);
    expect(await getBrainstorm(ownerId, id)).toMatchObject({ live: 1 });
  });

  it("clears away elements deleted over 30 days ago, and has a device that last looked before then load again", async () => {
    const id = await made(ownerId, "Ideas");
    await saveBrainstormElements(ownerId, id, save(0, [box("a"), box("b")]));
    await saveBrainstormElements(ownerId, id, save(1, [box("a", { version: 2, isDeleted: true })]));
    await pruneBrainstorm(ownerId, id);
    expect(await brainstormChanges(ownerId, id, { since: 1 })).toMatchObject({ clock: 2 });
    await db
      .update(brainstormElements)
      .set({ updatedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(brainstormElements.elementId, "a"));
    await pruneBrainstorm(ownerId, id);
    expect(await brainstormChanges(ownerId, id, { since: 1 })).toEqual({ reset: true });
    expect(await brainstormChanges(ownerId, id, { since: 2 })).toMatchObject({ elements: [] });
    expect(Object.keys(await drawing(ownerId, id))).toEqual(["b"]);
  });

  it("moves a drawing kept the old way into a row an element (migration 0034)", async () => {
    const id = await made(ownerId, "Ideas");
    const before = [box("a", { version: 7, versionNonce: 70 }), box("b", { version: 2 })];
    await db
      .update(brainstormBoards)
      .set({ scene: { elements: before }, clock: 0 })
      .where(eq(brainstormBoards.id, id));
    const migration = readFileSync("src/db/migrations/0034_brainstorm_elements.sql", "utf8");
    const moves = migration
      .slice(migration.indexOf("-- Each board's drawing"))
      .split("--> statement-breakpoint");
    for (const move of moves) await db.execute(sql.raw(move));

    expect(await drawing(ownerId, id)).toEqual({ a: before[0], b: before[1] });
    expect(await getBrainstorm(ownerId, id)).toMatchObject({
      clock: 1,
      live: 2,
      scene: { elements: [] },
    });
    const [row] = await db
      .select({ version: brainstormElements.version, nonce: brainstormElements.versionNonce })
      .from(brainstormElements)
      .where(eq(brainstormElements.elementId, "a"));
    expect(row).toEqual({ version: 7, nonce: 70 });
    // A device that loaded the board after the move saves on from clock 1.
    expect(await saveBrainstormElements(ownerId, id, save(1, [box("a", { version: 8 })]))).toMatchObject({
      ok: true,
      clock: 2,
      behind: false,
    });
  });

  it("gives a big board a page at a time", async () => {
    const id = await made(ownerId, "Ideas");
    const ink = "x".repeat(100_000);
    const strokes = Array.from({ length: 50 }, (_, index) =>
      box(`s${String(index).padStart(2, "0")}`, { type: "freedraw", ink }),
    );
    await saveBrainstormElements(ownerId, id, save(0, strokes));
    const seen: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const page = await brainstormChanges(ownerId, id, { since: 0, after });
      if (!page || "reset" in page) throw new Error("no page");
      seen.push(...page.elements.map((element) => element.id as string));
      after = page.next ?? undefined;
      pages += 1;
    } while (after);
    expect(pages).toBe(3);
    expect(seen).toEqual(strokes.map(({ id }) => id));
  });

  it(`holds at most ${MAX_BOARD_ELEMENTS} elements, and lets a full board be cleared`, async () => {
    const id = await made(ownerId, "Ideas");
    await saveBrainstormElements(ownerId, id, save(0, [box("a")]));
    await db
      .update(brainstormBoards)
      .set({ live: MAX_BOARD_ELEMENTS })
      .where(eq(brainstormBoards.id, id));
    expect(await saveBrainstormElements(ownerId, id, save(1, [box("b")]))).toEqual({
      ok: false,
      reason: "full",
    });
    expect(
      await saveBrainstormElements(ownerId, id, save(1, [box("a", { version: 2, isDeleted: true })])),
    ).toMatchObject({ ok: true });
  });

  it("sets and clears an icon from the list in code", async () => {
    const id = await made(ownerId, "Ideas");
    expect(brainstormIcon.safeParse({ boardId: id, icon: "<svg>" }).success).toBe(false);
    expect(await setBrainstormIcon(ownerId, brainstormIcon.parse({ boardId: id, icon: "lightbulb" }))).toBe(true);
    expect((await getBrainstorm(ownerId, id))!.icon).toBe("lightbulb");
    expect(await setBrainstormIcon(ownerId, { boardId: id, icon: null })).toBe(true);
    expect((await getBrainstorm(ownerId, id))!.icon).toBeNull();
  });

  it("deletes a board, audited with its name", async () => {
    const id = await made(ownerId, "Ideas");
    expect(await deleteBrainstorm(ownerId, id)).toBe(true);
    expect(await getBrainstorm(ownerId, id)).toBeNull();
    expect(await deleteBrainstorm(ownerId, id)).toBe(false);
    const { rows: entries } = await listAudit(ownerId);
    expect(entries.find(({ action }) => action === "brainstorm.delete")?.before).toEqual({
      name: "Ideas",
    });
  });

  it("lists a new board first, keeps the order when one is drawn on, finds by name and pages", async () => {
    const first = await made(ownerId, "Garden plans");
    await made(ownerId, "Book notes");
    await saveBrainstormElements(ownerId, first, save(0, [box("a")]));
    let page = await listBrainstorms(ownerId);
    expect(page.rows.map(({ name }) => name)).toEqual(["Book notes", "Garden plans"]);
    page = await listBrainstorms(ownerId, { q: "book" });
    expect(page.rows.map(({ name }) => name)).toEqual(["Book notes"]);
    // A % typed is a percent sign, not a pattern.
    expect((await listBrainstorms(ownerId, { q: "%" })).total).toBe(0);

    await db.insert(brainstormBoards).values(
      Array.from({ length: BRAINSTORM_PAGE_SIZE }, (_, index) => ({
        ownerId,
        name: `Board ${index}`,
      })),
    );
    page = await listBrainstorms(ownerId);
    expect(page.rows).toHaveLength(BRAINSTORM_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(BRAINSTORM_PAGE_SIZE + 2);
  });

  it("puts boards in the order given and leaves Last edited alone", async () => {
    const [a, b, c] = [await made(ownerId, "A"), await made(ownerId, "B"), await made(ownerId, "C")];
    const edited = async () =>
      (await listBrainstorms(ownerId)).rows.map(({ id, updatedAt }) => [id, updatedAt.getTime()]);
    const before = new Map((await edited()) as [string, number][]);

    expect(await reorderBrainstorms(ownerId, [a, c, b])).toBe(true);
    const page = await listBrainstorms(ownerId);
    expect(page.rows.map(({ id }) => id)).toEqual([a, c, b]);
    for (const { id, updatedAt } of page.rows) expect(updatedAt.getTime()).toBe(before.get(id));

    const { rows: entries } = await listAudit(ownerId);
    const entry = entries.find(({ action }) => action === "brainstorm.reorder");
    expect(entry?.after).toEqual([a, c, b]);
  });

  it("moves only the boards named, among the places they hold", async () => {
    const [a, b, c] = [await made(ownerId, "A"), await made(ownerId, "B"), await made(ownerId, "C")];
    // Shown first to last: C, B, A. Swapping C and A leaves B between them.
    expect(await reorderBrainstorms(ownerId, [a, c])).toBe(true);
    expect((await listBrainstorms(ownerId)).rows.map(({ id }) => id)).toEqual([a, b, c]);
    // A new board still goes first.
    const d = await made(ownerId, "D");
    expect((await listBrainstorms(ownerId)).rows[0].id).toBe(d);
  });

  it("moves nothing when any board is not the owner's", async () => {
    const [a, b] = [await made(ownerId, "A"), await made(ownerId, "B")];
    const stranger = await createTestOwner("stranger@example.com");
    const theirs = await made(stranger, "Theirs");
    expect(await reorderBrainstorms(ownerId, [a, b, theirs])).toBe(false);
    expect(await reorderBrainstorms(stranger, [b, a])).toBe(false);
    expect((await listBrainstorms(ownerId)).rows.map(({ id }) => id)).toEqual([b, a]);
    expect((await listBrainstorms(stranger)).rows.map(({ id }) => id)).toEqual([theirs]);
  });

  it("takes an order only as unique ids, at most a page of them", () => {
    const id = "6f1c1f6e-5d7a-4b7a-9f3e-0a1b2c3d4e5f";
    expect(brainstormOrder.safeParse([id]).success).toBe(true);
    expect(brainstormOrder.safeParse([]).success).toBe(false);
    expect(brainstormOrder.safeParse([id, id]).success).toBe(false);
    expect(brainstormOrder.safeParse(["not-a-uuid"]).success).toBe(false);
    const tooMany = Array.from({ length: BRAINSTORM_PAGE_SIZE + 1 }, () => crypto.randomUUID());
    expect(brainstormOrder.safeParse(tooMany).success).toBe(false);
  });

  it("never reaches another owner's board", async () => {
    const id = await made(ownerId, "Ideas");
    const stranger = await createTestOwner("stranger@example.com");
    expect(await getBrainstorm(stranger, id)).toBeNull();
    expect((await listBrainstorms(stranger)).total).toBe(0);
    expect(await renameBrainstorm(stranger, id, named("Mine"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveBrainstormElements(stranger, id, save(0, [box("a")]))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await brainstormChanges(stranger, id, { since: 0 })).toBeNull();
    expect(await setBrainstormIcon(stranger, { boardId: id, icon: null })).toBe(false);
    expect(await deleteBrainstorm(stranger, id)).toBe(false);
    const [row] = await db
      .select({ name: brainstormBoards.name, clock: brainstormBoards.clock })
      .from(brainstormBoards)
      .where(eq(brainstormBoards.id, id));
    expect(row).toEqual({ name: "Ideas", clock: 0 });
  });
});
