import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contacts, organizations, workflowBoards } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  addStarterBoard,
  createBoard,
  deleteBoard,
  reorderTemplates,
  saveScene,
  setBoardIcon,
  starBoard,
  startBoard,
  updateBoard,
} from "./boards";
import { STAGE_COLORS } from "./drawing";
import { boardSubjectOf, getBoard, listRecordBoards, listTemplates } from "./queries";
import {
  boardIcon,
  boardInput,
  boardOrder,
  boardStar,
  boardStart,
  boardSubject,
  MAX_BOARD_STAGES,
  MAX_ELEMENTS,
  MAX_RECORD_BOARDS,
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
    ["a picture that names no stored picture", [{ id: "a", type: "image" }]],
    ["a picture whose id is nothing", [{ id: "a", type: "image", fileId: null }]],
    ["a picture whose id is an address", [{ id: "a", type: "image", fileId: "../scene" }]],
    ["a picture whose id is over 64 characters", [{ id: "a", type: "image", fileId: "a".repeat(65) }]],
    ["an id for a picture that is not text", [box("a", { fileId: 7 })]],
    ["an element with no id", [{ type: "rectangle" }]],
    ["a status that is not one", [stage("a", { customData: { stage: { status: "late" } } })]],
    ["anything else kept on a box", [box("a", { customData: { note: "x" } })]],
    ["more beside a stage's status and name", [box("a", { customData: { stage: { status: "done", by: "x" } } })]],
    ["a stage's name over 200 characters", [box("a", { customData: { stage: { status: "done", name: "x".repeat(201) } } })]],
    ["a stage's name that is blank", [box("a", { customData: { stage: { status: "done", name: " " } } })]],
    ["a stage's name that is not text", [box("a", { customData: { stage: { status: "done", name: 7 } } })]],
  ])("refuses %s", (_label, elements) => {
    expect(sceneSave.safeParse({ version: 1, elements }).success).toBe(false);
  });

  it("keeps a picture by the id of its stored bytes", () => {
    const fileId = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b";
    const [kept] = save(1, [
      { id: "a", type: "image", fileId, status: "saved", scale: [1, 1] },
    ]).elements;
    expect(kept).toMatchObject({ type: "image", fileId, scale: [1, 1] });
    // Every other element says it shows no picture.
    expect(save(1, [box("a", { fileId: null })]).elements[0].fileId).toBeNull();
  });

  it("keeps the name given with a stage's mark, trimmed", () => {
    const [kept] = save(1, [
      box("a", { customData: { stage: { status: "done", name: " Signed off " } } }),
    ]).elements;
    expect(kept.customData).toEqual({ stage: { status: "done", name: "Signed off" } });
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

  it("takes the name given with the mark where the box holds no text", () => {
    const named = (id: string, x: number) =>
      box(id, { x, customData: { stage: { status: "done", name: "Signed off" } } });
    expect(names([named("a", 0), named("b", 200), label("b", "Sent")])).toEqual([
      "Signed off",
      "Sent",
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

describe("what a record's board is asked for", () => {
  const id = "0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11";

  it("takes a company or a person, never both or anything else", () => {
    expect(boardSubject.safeParse({ organizationId: id }).success).toBe(true);
    expect(boardSubject.safeParse({ contactId: id }).success).toBe(true);
    for (const value of [
      { organizationId: id, contactId: id },
      { organizationId: "acme" },
      { contactId: id, ownerId: id },
      {},
    ]) {
      expect(boardSubject.safeParse(value).success).toBe(false);
    }
  });

  it("starts from a workflow or from a name", () => {
    expect(boardStart.safeParse({ templateId: id }).success).toBe(true);
    expect(boardStart.parse({ name: " Audit ", description: "" })).toEqual({
      name: "Audit",
      description: null,
    });
    expect(boardStart.safeParse({ templateId: id, name: "Audit" }).success).toBe(false);
    expect(boardStart.safeParse({ name: " ", description: "" }).success).toBe(false);
  });

  it("takes an icon only from the list, or none", () => {
    expect(boardIcon.safeParse({ boardId: id, icon: "rocket" }).success).toBe(true);
    expect(boardIcon.safeParse({ boardId: id, icon: null }).success).toBe(true);
    for (const value of [
      { boardId: id, icon: "skull" },
      { boardId: id, icon: "<svg onload=alert(1)>" },
      { boardId: id, icon: "" },
      { boardId: "not-a-uuid", icon: "rocket" },
      { boardId: id, icon: "rocket", color: "red" },
    ]) {
      expect(boardIcon.safeParse(value).success).toBe(false);
    }
  });

  it("stars a board by its id with a yes or a no", () => {
    expect(boardStar.safeParse({ id, starred: "1" }).success).toBe(true);
    for (const value of [
      { id, starred: "true" },
      { id: "x", starred: "1" },
      { id, starred: "1", organizationId: id },
    ]) {
      expect(boardStar.safeParse(value).success).toBe(false);
    }
  });

  it("takes an order as ids, each once", () => {
    expect(boardOrder.safeParse([id]).success).toBe(true);
    expect(boardOrder.safeParse([id, id]).success).toBe(false);
    expect(boardOrder.safeParse([]).success).toBe(false);
    expect(boardOrder.safeParse(["first"]).success).toBe(false);
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

  describe("in the owner's order", () => {
    const listed = async () =>
      (await listTemplates(ownerId)).map(({ name }) => name);

    it("lists a new workflow last, and by name where none was moved", async () => {
      await db.insert(workflowBoards).values([
        { ownerId, name: "Retainer" },
        { ownerId, name: "Audit" },
      ]);
      expect(await listed()).toEqual(["Audit", "Retainer"]);
      await create("Build");
      expect(await listed()).toEqual(["Audit", "Retainer", "Build"]);
    });

    it("keeps the order the owner gives", async () => {
      const a = await create("Audit");
      const b = await create("Build");
      const c = await create("Care");

      expect(await reorderTemplates(ownerId, [c, a, b])).toBe(true);
      expect(await listed()).toEqual(["Care", "Audit", "Build"]);
      expect((await listAudit(ownerId)).rows[0]).toMatchObject({
        action: "workflow.reorder",
        after: [c, a, b],
      });
    });

    it("refuses an order that is not exactly the owner's workflows", async () => {
      const a = await create("Audit");
      const b = await create("Build");
      const stranger = await createTestOwner("stranger@example.com");
      const theirs = await createBoard(stranger, board("Theirs"));
      if (!theirs.ok) throw new Error(theirs.reason);
      const [company] = await db
        .insert(organizations)
        .values({ ownerId, name: "Acme" })
        .returning({ id: organizations.id });
      const copy = await startBoard(
        ownerId,
        { organizationId: company.id },
        { templateId: a },
      );
      if (!copy.ok) throw new Error(copy.reason);

      for (const ids of [[b], [b, a, theirs.id], [b, theirs.id], [b, a, copy.id]]) {
        expect(await reorderTemplates(ownerId, ids)).toBe(false);
      }
      expect(await reorderTemplates(stranger, [b, a])).toBe(false);
      expect(await listed()).toEqual(["Audit", "Build"]);
    });
  });

  describe("on a company or a person", () => {
    let organizationId: string;
    let contactId: string;
    let templateId: string;

    const drawn = [
      stage("a"),
      label("a", "Kickoff"),
      stage("b", { x: 200, backgroundColor: "#a5d8ff" }),
      label("b", "Build"),
      arrow("a", "b"),
      box("note", { x: 400 }),
    ];
    const start = async (
      subject: Parameters<typeof startBoard>[1],
      from: Parameters<typeof startBoard>[2] = { templateId },
    ) => {
      const result = await startBoard(ownerId, subject, from);
      if (!result.ok) throw new Error(result.reason);
      return result.id;
    };
    const stored = async (id: string) => (await getBoard(ownerId, id))!;

    beforeEach(async () => {
      [{ id: organizationId }] = await db
        .insert(organizations)
        .values({ ownerId, name: "Acme" })
        .returning({ id: organizations.id });
      [{ id: contactId }] = await db
        .insert(contacts)
        .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
        .returning({ id: contacts.id });
      templateId = await create("Onboarding");
      await saveScene(ownerId, templateId, save(1, drawn));
    });

    it("starts a copy with the same boxes and every stage not started", async () => {
      const id = await start({ organizationId });
      const copy = await stored(id);

      expect(copy).toMatchObject({
        name: "Onboarding",
        version: 1,
        sourceBoardId: templateId,
        organizationId,
        contactId: null,
        stages: [
          { elementId: "a", name: "Kickoff", status: "not_started" },
          { elementId: "b", name: "Build", status: "not_started" },
        ],
      });
      expect(copy.scene.elements.map((element) => element.id)).toEqual(
        drawn.map((element) => element.id),
      );
      expect(copy.scene.elements.find((element) => element.id === "b")).toMatchObject({
        backgroundColor: STAGE_COLORS.not_started,
      });
      expect((await listAudit(ownerId)).rows[0]).toMatchObject({
        action: "workflow.start",
        entityId: id,
        after: { name: "Onboarding", sourceBoardId: templateId, organizationId },
      });
      // A record's board is not one of the owner's workflows.
      expect(await listTemplates(ownerId)).toHaveLength(1);
      expect(await boardSubjectOf(ownerId, copy)).toEqual({
        kind: "organization",
        id: organizationId,
        name: "Acme",
        pictureVersion: null,
      });
    });

    it("starts a blank board on a person under a name of its own", async () => {
      const id = await start(
        { contactId },
        boardInput.parse({ name: "Onboarding", description: "" }),
      );
      const blank = await stored(id);

      expect(blank).toMatchObject({
        name: "Onboarding",
        scene: { elements: [] },
        stages: [],
        sourceBoardId: null,
        organizationId: null,
        contactId,
      });
      expect(await boardSubjectOf(ownerId, blank)).toEqual({
        kind: "contact",
        id: contactId,
        name: "Priya Sharma",
        pictureVersion: null,
      });
      expect(await boardSubjectOf(ownerId, await stored(templateId))).toBeNull();
    });

    it("lists a record's own boards and no other's", async () => {
      const first = await start({ organizationId });
      const second = await start({ organizationId });
      await start({ contactId });

      const boards = await listRecordBoards(ownerId, { organizationId });
      expect(boards.map(({ id }) => id).sort()).toEqual([first, second].sort());
      expect(await listRecordBoards(ownerId, { contactId })).toHaveLength(1);
    });

    it("marks a workflow with an icon its copies take, and changes or clears it", async () => {
      expect(await setBoardIcon(ownerId, { boardId: templateId, icon: "rocket" })).toBe(true);
      const id = await start({ organizationId });
      expect(await stored(id)).toMatchObject({ icon: "rocket" });
      expect((await listTemplates(ownerId))[0].icon).toBe("rocket");

      // A copy's icon is its own from then on.
      expect(await setBoardIcon(ownerId, { boardId: id, icon: "handshake" })).toBe(true);
      expect(await setBoardIcon(ownerId, { boardId: templateId, icon: null })).toBe(true);
      expect(await stored(templateId)).toMatchObject({ icon: null });
      expect((await listRecordBoards(ownerId, { organizationId }))[0].icon).toBe(
        "handshake",
      );
      expect((await listAudit(ownerId)).rows[0]).toMatchObject({
        action: "workflow.icon",
        entityId: templateId,
        before: { icon: "rocket" },
        after: { icon: null },
      });

      const stranger = await createTestOwner("stranger@example.com");
      expect(await setBoardIcon(stranger, { boardId: id, icon: "zap" })).toBe(false);
      expect(await stored(id)).toMatchObject({ icon: "handshake" });
    });

    it("stars one board of a record, which is listed first", async () => {
      const first = await start({ organizationId });
      const second = await start({ organizationId });
      const theirs = await start({ contactId });
      const order = async () =>
        (await listRecordBoards(ownerId, { organizationId })).map(({ id }) => id);
      expect(await order()).toEqual([second, first]);

      expect(await starBoard(ownerId, first, true)).toBe(true);
      expect(await starBoard(ownerId, theirs, true)).toBe(true);
      expect(await order()).toEqual([first, second]);

      // Starring another moves the star; the person's stays where it is.
      expect(await starBoard(ownerId, second, true)).toBe(true);
      expect(await stored(first)).toMatchObject({ starred: false });
      expect(await order()).toEqual([second, first]);
      expect(await stored(theirs)).toMatchObject({ starred: true });
      expect((await listAudit(ownerId)).rows[0]).toMatchObject({
        action: "workflow.star",
        entityId: second,
        after: { starred: true },
      });

      // Unstarring a board that has no star leaves the record's star alone.
      expect(await starBoard(ownerId, first, false)).toBe(true);
      expect(await stored(second)).toMatchObject({ starred: true });

      expect(await starBoard(ownerId, second, false)).toBe(true);
      expect(await stored(second)).toMatchObject({ starred: false });
    });

    it("stars no workflow, and nothing of another owner's", async () => {
      const id = await start({ organizationId });
      const stranger = await createTestOwner("stranger@example.com");

      expect(await starBoard(ownerId, templateId, true)).toBe(false);
      expect(await starBoard(stranger, id, true)).toBe(false);
      expect(await stored(templateId)).toMatchObject({ starred: false });
      expect(await stored(id)).toMatchObject({ starred: false });
    });

    it("starts nothing on a record or from a workflow that is not the owner's", async () => {
      const stranger = await createTestOwner("stranger@example.com");
      const copy = await start({ organizationId });
      const missing = { ok: false, reason: "not_found" };

      expect(await startBoard(stranger, { organizationId }, { templateId })).toEqual(missing);
      expect(await startBoard(stranger, { contactId }, { templateId })).toEqual(missing);
      // Their own record, the owner's workflow.
      const [theirs] = await db
        .insert(organizations)
        .values({ ownerId: stranger, name: "Elsewhere" })
        .returning({ id: organizations.id });
      expect(
        await startBoard(stranger, { organizationId: theirs.id }, { templateId }),
      ).toEqual(missing);
      // A record's board is not a workflow to copy.
      expect(
        await startBoard(ownerId, { contactId }, { templateId: copy }),
      ).toEqual(missing);
      expect(await listRecordBoards(ownerId, { contactId })).toEqual([]);
    });

    it("stops at the most boards a record can have", async () => {
      await db.insert(workflowBoards).values(
        Array.from({ length: MAX_RECORD_BOARDS }, (_, index) => ({
          ownerId,
          organizationId,
          name: `Board ${index}`,
        })),
      );
      expect(await startBoard(ownerId, { organizationId }, { templateId })).toEqual({
        ok: false,
        reason: "limit",
      });
      // Another record has room of its own.
      expect((await startBoard(ownerId, { contactId }, { templateId })).ok).toBe(true);
    });

    it("keeps the name given to a stage of handwriting through a copy", async () => {
      const sketched = await create("Sketched");
      const named = { stage: { status: "done", name: "Signed off" } };
      await saveScene(ownerId, sketched, save(1, [box("s", { customData: named })]));

      const id = await start({ organizationId }, { templateId: sketched });
      const copy = await stored(id);
      expect(copy.stages).toEqual([
        { elementId: "s", name: "Signed off", status: "not_started" },
      ]);
      expect(copy.scene.elements[0].customData).toEqual({
        stage: { status: "not_started", name: "Signed off" },
      });
    });

    it("keeps a copy, its workflow and its sibling copies apart", async () => {
      const copy = await start({ organizationId });
      const sibling = await start({ contactId });
      const template = await stored(templateId);
      const untouched = await stored(sibling);

      // The copy changes: a stage moved on, a new drawing, a new name.
      await saveScene(
        ownerId,
        copy,
        save(1, [
          ...drawn.slice(0, 2),
          stage("b", { x: 200, customData: { stage: { status: "in_progress" } } }),
          ...drawn.slice(3),
        ]),
      );
      expect((await stored(copy)).stages[1]).toMatchObject({ status: "in_progress" });
      await saveScene(ownerId, copy, save(2, [stage("z"), label("z", "Handover")]));
      await updateBoard(ownerId, copy, board("Acme onboarding"));
      expect(await stored(templateId)).toEqual(template);
      expect(await stored(sibling)).toEqual(untouched);

      // The workflow changes: the copies made before stay as they were.
      const changed = await stored(copy);
      await saveScene(ownerId, templateId, save(2, [stage("q"), label("q", "Review")]));
      await updateBoard(ownerId, templateId, board("Review cycle"));
      expect(await stored(copy)).toEqual(changed);
      expect(await stored(sibling)).toEqual(untouched);
      // A copy started now is of the workflow as it is now.
      expect((await stored(await start({ contactId }))).stages).toEqual([
        { elementId: "q", name: "Review", status: "not_started" },
      ]);

      // The workflow is deleted: the copies stay, and only forget where they came from.
      await deleteBoard(ownerId, templateId);
      expect(await stored(copy)).toEqual({ ...changed, sourceBoardId: null });
      expect(await stored(sibling)).toEqual({ ...untouched, sourceBoardId: null });

      // A copy is deleted: its sibling stays.
      await deleteBoard(ownerId, copy);
      expect(await getBoard(ownerId, copy)).toBeNull();
      expect(await stored(sibling)).toEqual({ ...untouched, sourceBoardId: null });
    });

    it("lets a record's board share a name with a workflow or another board", async () => {
      const copy = await start({ organizationId });
      await start({ organizationId });
      expect(await updateBoard(ownerId, copy, board("Onboarding"))).toEqual({
        ok: true,
        id: copy,
      });
    });

    it("removes a record's boards with the record", async () => {
      const copy = await start({ organizationId });
      await db.delete(organizations).where(eq(organizations.id, organizationId));
      expect(await getBoard(ownerId, copy)).toBeNull();
      expect(await getBoard(ownerId, templateId)).not.toBeNull();
    });
  });
});
