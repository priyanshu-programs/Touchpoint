import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { brainstormBoards } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getBrainstorm, listBrainstorms } from "./queries";
import {
  BRAINSTORM_PAGE_SIZE,
  brainstormIcon,
  brainstormName,
  brainstormSceneSave,
  MAX_BRAINSTORM_BOARDS,
} from "./schema";
import {
  createBrainstorm,
  deleteBrainstorm,
  renameBrainstorm,
  saveBrainstormScene,
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
  ...more,
});
const save = (version: number, elements: unknown[]) =>
  brainstormSceneSave.parse({ version, elements });

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

describe("brainstormSceneSave", () => {
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

  it("refuses embedded pages, pictures with no stored id and unknown envelope fields", () => {
    expect(brainstormSceneSave.safeParse({ version: 1, elements: [box("a", { type: "iframe" })] }).success).toBe(false);
    expect(brainstormSceneSave.safeParse({ version: 1, elements: [box("a", { type: "embeddable" })] }).success).toBe(false);
    expect(brainstormSceneSave.safeParse({ version: 1, elements: [box("a", { type: "image" })] }).success).toBe(false);
    expect(brainstormSceneSave.safeParse({ version: 1, elements: [], files: {} }).success).toBe(false);
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
    expect(board).toMatchObject({ name: "Q3 ideas", version: 1, icon: null });
    expect(board!.scene.elements).toEqual([]);
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

  it("saves the drawing only from the version it was loaded at", async () => {
    const id = await made(ownerId, "Ideas");
    expect(await saveBrainstormScene(ownerId, id, save(1, [box("a")]))).toEqual({
      ok: true,
      version: 2,
    });
    expect(await saveBrainstormScene(ownerId, id, save(1, [box("b")]))).toEqual({
      ok: false,
      reason: "conflict",
    });
    const board = await getBrainstorm(ownerId, id);
    expect(board!.version).toBe(2);
    expect(board!.scene.elements.map(({ id }) => id)).toEqual(["a"]);
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

  it("lists the board drawn on last first, finds by name and pages", async () => {
    const first = await made(ownerId, "Garden plans");
    await made(ownerId, "Book notes");
    await saveBrainstormScene(ownerId, first, save(1, [box("a")]));
    let page = await listBrainstorms(ownerId);
    expect(page.rows.map(({ name }) => name)).toEqual(["Garden plans", "Book notes"]);
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

  it("never reaches another owner's board", async () => {
    const id = await made(ownerId, "Ideas");
    const stranger = await createTestOwner("stranger@example.com");
    expect(await getBrainstorm(stranger, id)).toBeNull();
    expect((await listBrainstorms(stranger)).total).toBe(0);
    expect(await renameBrainstorm(stranger, id, named("Mine"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveBrainstormScene(stranger, id, save(1, [box("a")]))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setBrainstormIcon(stranger, { boardId: id, icon: null })).toBe(false);
    expect(await deleteBrainstorm(stranger, id)).toBe(false);
    const [row] = await db
      .select({ name: brainstormBoards.name, version: brainstormBoards.version })
      .from(brainstormBoards)
      .where(eq(brainstormBoards.id, id));
    expect(row).toEqual({ name: "Ideas", version: 1 });
  });
});
