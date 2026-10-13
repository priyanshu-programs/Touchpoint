import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { workflowBoards } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  addStarterBoard,
  createBoard,
  deleteBoard,
  saveScene,
  updateBoard,
} from "./boards";
import { getBoard, listTemplates } from "./queries";
import {
  boardInput,
  MAX_BOARD_STAGES,
  MAX_ELEMENTS,
  MAX_TEMPLATES,
  sceneSave,
} from "./schema";
import { stagesOf, UNNAMED_STAGE } from "./stages";
import { STARTER_BOARDS, starterScene } from "./starters";

const board = (name: string, description = "") =>
  boardInput.parse({ name, description });

// A box, the text inside it and an arrow, as the whiteboard would send them.
const box = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  ...more,
});
const stage = (id: string, more: Record<string, unknown> = {}) =>
  box(id, { customData: { stage: { status: "not_started" } }, ...more });
const label = (containerId: string, text: string) => ({
  id: `${containerId}-text`,
  type: "text",
  containerId,
  text,
  originalText: text,
});
const arrow = (from: string, to: string) => ({
  id: `${from}-${to}`,
  type: "arrow",
  startBinding: { elementId: from, focus: 0, gap: 1 },
  endBinding: { elementId: to, focus: 0, gap: 1 },
});
const save = (version: number, elements: unknown[]) =>
  sceneSave.parse({ version, elements });
const names = (elements: Record<string, unknown>[]) =>
  stagesOf(elements).map(({ name }) => name);

describe("boardInput", () => {
  it("trims the name and stores an empty description as nothing", () => {
    expect(boardInput.parse({ name: " Onboarding ", description: " " })).toEqual({
      name: "Onboarding",
      description: null,
    });
  });

  it.each([
    ["no name", { name: " ", description: "" }],
    ["a name over 80 characters", { name: "x".repeat(81), description: "" }],
    ["an unexpected property", { name: "Onboarding", description: "", version: 9 }],
  ])("rejects %s", (_label, value) => {
    expect(boardInput.safeParse(value).success).toBe(false);
  });
});

describe("sceneSave", () => {
  it("keeps how an element is drawn as it came", () => {
    const [kept] = save(1, [
      box("a", { strokeColor: "#1e1e1e", points: [[0, 0]], seed: 7 }),
    ]).elements;
    expect(kept).toMatchObject({ strokeColor: "#1e1e1e", points: [[0, 0]], seed: 7 });
  });

  it("keeps a web link and drops any other", () => {
    const link = (value: unknown) =>
      save(1, [box("a", { link: value })]).elements[0].link;
    expect(link("https://example.com/brief")).toBe("https://example.com/brief");
    expect(link("javascript:alert(1)")).toBeNull();
    expect(link("/people")).toBeNull();
    expect(link(7)).toBeNull();
    expect(link(null)).toBeNull();
    expect(save(1, [box("a")]).elements[0]).not.toHaveProperty("link");
  });

  it.each([
    ["an embedded page", [{ id: "a", type: "embeddable" }]],
    ["an iframe", [{ id: "a", type: "iframe" }]],
    ["a picture", [{ id: "a", type: "image" }]],
    ["an element with no id", [{ type: "rectangle" }]],
    ["a status that is not one", [stage("a", { customData: { stage: { status: "late" } } })]],
    ["anything else kept on a box", [box("a", { customData: { note: "x" } })]],
    ["more beside a stage's status", [box("a", { customData: { stage: { status: "done", by: "x" } } })]],
  ])("refuses %s", (_label, elements) => {
    expect(sceneSave.safeParse({ version: 1, elements }).success).toBe(false);
  });

  it.each([
    ["no version", { elements: [] }],
    ["a version below 1", { version: 0, elements: [] }],
    ["an unexpected property", { version: 1, elements: [], name: "x" }],
    [
      "more elements than a drawing may have",
      {
        version: 1,
        elements: Array.from({ length: MAX_ELEMENTS + 1 }, (_, index) =>
          box(String(index)),
        ),
      },
    ],
  ])("refuses %s", (_label, value) => {
    expect(sceneSave.safeParse(value).success).toBe(false);
  });
});

describe("stagesOf", () => {
  it("takes only boxes made a stage, named by the text inside them", () => {
    expect(
      stagesOf([
        stage("a"),
        label("a", "Kickoff\n  call"),
        box("b"),
        label("b", "A note"),
        stage("c", { x: 200, customData: { stage: { status: "done" } } }),
        { id: "t", type: "text", text: "Loose words" },
      ]),
    ).toEqual([
      { elementId: "a", name: "Kickoff call", status: "not_started" },
      { elementId: "c", name: UNNAMED_STAGE, status: "done" },
    ]);
  });

  it("ignores a stage mark on anything that cannot hold a name", () => {
    expect(
      stagesOf([{ id: "a", type: "arrow", customData: { stage: { status: "done" } } }]),
    ).toEqual([]);
  });

  it("follows the arrows, wherever the boxes sit", () => {
    expect(
      names([
        stage("c", { x: 0 }),
        label("c", "Third"),
        stage("a", { x: 400 }),
        label("a", "First"),
        stage("b", { x: 200 }),
        label("b", "Second"),
        arrow("a", "b"),
        arrow("b", "c"),
        // Drawn twice, and one that joins nothing.
        arrow("a", "b"),
        arrow("a", "nowhere"),
      ]),
    ).toEqual(["First", "Second", "Third"]);
  });

  it("reads boxes no arrow joins top to bottom, then left to right", () => {
    expect(
      names([
        stage("d", { x: 0, y: 300 }),
        label("d", "Below"),
        // A row placed by hand is never quite level.
        stage("b", { x: 200, y: 4 }),
        label("b", "Right"),
        stage("a", { x: 0, y: 12 }),
        label("a", "Left"),
      ]),
    ).toEqual(["Left", "Right", "Below"]);
  });

  it("puts both ways on from a stage after it, the upper first", () => {
    expect(
      names([
        stage("s", { x: 0 }),
        label("s", "Proposal"),
        stage("l", { x: 200, y: 200 }),
        label("l", "Lost"),
        stage("w", { x: 200, y: 0 }),
        label("w", "Won"),
        arrow("s", "l"),
        arrow("s", "w"),
      ]),
    ).toEqual(["Proposal", "Won", "Lost"]);
  });

  it("still lists every stage of a ring of arrows", () => {
    expect(
      names([
        stage("a", { x: 0 }),
        label("a", "Plan"),
        stage("b", { x: 200 }),
        label("b", "Do"),
        stage("c", { x: 400 }),
        label("c", "Review"),
        arrow("a", "b"),
        arrow("b", "c"),
        arrow("c", "a"),
      ]),
    ).toEqual(["Plan", "Do", "Review"]);
  });
});

describe("starters", () => {
  it.each(STARTER_BOARDS)("$name is a drawing the whiteboard may save", (starter) => {
    const { elements } = starterScene(starter);
    expect(sceneSave.safeParse({ version: 1, elements }).success).toBe(true);
    expect(new Set(elements.map(({ id }) => id)).size).toBe(elements.length);
    expect(names(elements)).toEqual(starter.stages.map(({ name }) => name));
  });
});

describe("workflows", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  const create = async (name: string) => {
    const result = await createBoard(ownerId, board(name));
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  };

  it("creates a workflow with an empty drawing at version 1", async () => {
    const id = await create("Onboarding");
    expect(await getBoard(ownerId, id)).toMatchObject({
      name: "Onboarding",
      description: null,
      scene: { elements: [] },
      stages: [],
      version: 1,
      starterKey: null,
      organizationId: null,
      contactId: null,
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.create",
      entityId: id,
    });
  });

  it("refuses a name another workflow has, whatever its capitals", async () => {
    await create("Onboarding");
    expect(await createBoard(ownerId, board("ONBOARDING"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });

  it("stops at the most workflows an owner can have", async () => {
    await db.insert(workflowBoards).values(
      Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
        ownerId,
        name: `Workflow ${index}`,
      })),
    );
    expect(await createBoard(ownerId, board("One more"))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("renames and describes a workflow without touching its drawing", async () => {
    const id = await create("Onboarding");
    await saveScene(ownerId, id, save(1, [stage("a"), label("a", "Kickoff")]));
    const other = await create("Offboarding");

    expect(await updateBoard(ownerId, id, board("offboarding"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect(await updateBoard(ownerId, other, board("OFFBOARDING", "Leaving"))).toEqual({
      ok: true,
      id: other,
    });
    expect(await updateBoard(ownerId, id, board("Welcome", "First month"))).toEqual({
      ok: true,
      id,
    });
    expect(await getBoard(ownerId, id)).toMatchObject({
      name: "Welcome",
      description: "First month",
      version: 2,
      stages: [{ name: "Kickoff" }],
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.update",
      before: { name: "Onboarding", description: null },
    });
  });

  it("saves a drawing, works its stages out and moves the version on", async () => {
    const id = await create("Onboarding");
    const elements = [
      stage("b", { x: 200 }),
      label("b", "Build"),
      stage("a"),
      label("a", "Kickoff"),
      arrow("a", "b"),
    ];
    expect(await saveScene(ownerId, id, save(1, elements))).toEqual({
      ok: true,
      version: 2,
    });

    const saved = await getBoard(ownerId, id);
    expect(saved?.scene.elements.map(({ id: elementId }) => elementId)).toEqual(
      elements.map((element) => element.id),
    );
    expect(saved?.stages).toEqual([
      { elementId: "a", name: "Kickoff", status: "not_started" },
      { elementId: "b", name: "Build", status: "not_started" },
    ]);
    expect((await listTemplates(ownerId))[0].stages).toHaveLength(2);
    // A drawing is saved every few seconds, so a save leaves no audit row.
    expect((await listAudit(ownerId)).rows).toHaveLength(1);
  });

  it("refuses a save made from an older version and keeps what is stored", async () => {
    const id = await create("Onboarding");
    await saveScene(ownerId, id, save(1, [stage("a"), label("a", "Kickoff")]));

    expect(await saveScene(ownerId, id, save(1, []))).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await getBoard(ownerId, id))?.stages).toHaveLength(1);
  });

  it("refuses a drawing with more stages than a workflow may have", async () => {
    const id = await create("Onboarding");
    const elements = Array.from({ length: MAX_BOARD_STAGES + 1 }, (_, index) =>
      stage(String(index)),
    );
    expect(await saveScene(ownerId, id, save(1, elements))).toEqual({
      ok: false,
      reason: "stage_limit",
    });
  });

  it("deletes a workflow with its drawing", async () => {
    const id = await create("Onboarding");
    await saveScene(ownerId, id, save(1, [stage("a"), label("a", "Kickoff")]));

    expect(await deleteBoard(ownerId, id)).toBe(true);
    expect(await getBoard(ownerId, id)).toBeNull();
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.delete",
      before: { name: "Onboarding", stages: ["Kickoff"] },
    });
    expect(await deleteBoard(ownerId, id)).toBe(false);
  });

  it("adds a starter once, with its stages drawn", async () => {
    const result = await addStarterBoard(ownerId, "prospecting");
    if (!result.ok) throw new Error(result.reason);

    const added = await getBoard(ownerId, result.id);
    expect(added).toMatchObject({ name: "Prospecting", starterKey: "prospecting" });
    expect(added?.stages.map(({ name }) => name)).toEqual([
      "Identified",
      "Contacted",
      "In conversation",
      "Proposal sent",
      "Won",
      "Lost",
    ]);
    expect(await addStarterBoard(ownerId, "prospecting")).toEqual({
      ok: false,
      reason: "already_added",
    });
    expect(await addStarterBoard(ownerId, "not-a-starter")).toEqual({
      ok: false,
      reason: "not_found",
    });

    // Deleted, it is on offer again.
    await deleteBoard(ownerId, result.id);
    expect((await addStarterBoard(ownerId, "prospecting")).ok).toBe(true);
  });

  it("refuses a starter whose name a workflow of the owner's already has", async () => {
    await create("prospecting");
    expect(await addStarterBoard(ownerId, "prospecting")).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });

  it("keeps one owner's workflows from another", async () => {
    const id = await create("Onboarding");
    const stranger = await createTestOwner("stranger@example.com");

    expect(await getBoard(stranger, id)).toBeNull();
    expect(await listTemplates(stranger)).toEqual([]);
    expect(await updateBoard(stranger, id, board("Taken"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveScene(stranger, id, save(1, [stage("a")]))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteBoard(stranger, id)).toBe(false);
    // The same name is free to another owner.
    expect((await createBoard(stranger, board("Onboarding"))).ok).toBe(true);

    const [kept] = await db
      .select({ name: workflowBoards.name, version: workflowBoards.version })
      .from(workflowBoards)
      .where(eq(workflowBoards.id, id));
    expect(kept).toEqual({ name: "Onboarding", version: 1 });
  });
});
