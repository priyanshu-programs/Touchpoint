import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { workflowTemplates, workflowTemplateStages } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { linearEdges } from "./edges";
import { getTemplate, listTemplates } from "./queries";
import {
  MAX_CHECKLIST_ITEMS,
  MAX_STAGE_TASKS,
  MAX_STAGES,
  MAX_TEMPLATES,
  stageInput,
  stageOrder,
  templateInput,
} from "./schema";
import { STARTER_TEMPLATES } from "./starters";
import {
  addStage,
  addStarterTemplate,
  createTemplate,
  deleteTemplate,
  removeStage,
  reorderStages,
  updateStage,
  updateTemplate,
} from "./templates";

const template = (name: string, description = "") =>
  templateInput.parse({ name, description });

const stage = (name: string, more: Record<string, unknown> = {}) =>
  stageInput.parse({
    name,
    description: "",
    kind: "normal",
    slaDays: "",
    checklist: [],
    defaultTasks: [],
    ...more,
  });

describe("templateInput", () => {
  it("trims the name and stores an empty description as nothing", () => {
    expect(templateInput.parse({ name: " Onboarding ", description: " " })).toEqual({
      name: "Onboarding",
      description: null,
    });
  });

  it.each([
    ["no name", { name: " ", description: "" }],
    ["a name over 80 characters", { name: "x".repeat(81), description: "" }],
    ["an unexpected property", { name: "Onboarding", description: "", version: 9 }],
  ])("rejects %s", (_label, value) => {
    expect(templateInput.safeParse(value).success).toBe(false);
  });
});

describe("stageInput", () => {
  it("takes numbers as they were typed", () => {
    expect(
      stage("Contacted", {
        slaDays: "14",
        checklist: [{ label: " Reply received ", required: true }],
        defaultTasks: [{ title: " Follow up ", offsetDays: "3", priority: "high" }],
      }),
    ).toEqual({
      name: "Contacted",
      description: null,
      kind: "normal",
      slaDays: 14,
      checklist: [{ label: "Reply received", required: true }],
      defaultTasks: [{ title: "Follow up", offsetDays: 3, priority: "high" }],
    });
  });

  const base = {
    name: "Contacted",
    description: "",
    kind: "normal",
    slaDays: "",
    checklist: [],
    defaultTasks: [],
  };
  const task = { title: "Follow up", offsetDays: 0, priority: "normal" };
  it.each([
    ["no name", { ...base, name: "" }],
    ["a kind it does not know", { ...base, kind: "paused" }],
    ["a deadline of no days", { ...base, slaDays: "0" }],
    ["a deadline over a year", { ...base, slaDays: "366" }],
    ["a deadline that is not a number", { ...base, slaDays: "soon" }],
    ["a deadline in part days", { ...base, slaDays: "1.5" }],
    ["a checklist item without a name", { ...base, checklist: [{ label: " ", required: false }] }],
    ["a checklist item with an id that is not one", { ...base, checklist: [{ id: "1", label: "Sent", required: false }] }],
    ["a checklist item with more to it", { ...base, checklist: [{ label: "Sent", required: false, doneAt: "now" }] }],
    ["too many checklist items", { ...base, checklist: Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, () => ({ label: "Sent", required: false })) }],
    ["a task without a title", { ...base, defaultTasks: [{ ...task, title: "" }] }],
    ["a task due before the stage is entered", { ...base, defaultTasks: [{ ...task, offsetDays: -1 }] }],
    ["a task due over a year on", { ...base, defaultTasks: [{ ...task, offsetDays: 366 }] }],
    ["a task of a priority it does not know", { ...base, defaultTasks: [{ ...task, priority: "urgent" }] }],
    ["too many tasks", { ...base, defaultTasks: Array.from({ length: MAX_STAGE_TASKS + 1 }, () => task) }],
    ["an end stage with a deadline", { ...base, kind: "won", slaDays: "7" }],
    ["an end stage with a checklist", { ...base, kind: "lost", checklist: [{ label: "Sent", required: false }] }],
    ["an unexpected property", { ...base, position: 0 }],
  ])("rejects %s", (_label, value) => {
    expect(stageInput.safeParse(value).success).toBe(false);
  });

  it("lets an end stage create tasks", () => {
    expect(stage("Won", { kind: "won", defaultTasks: [task] }).defaultTasks).toEqual([task]);
  });

  it("takes an order only as a list of ids", () => {
    expect(stageOrder.safeParse([]).success).toBe(false);
    expect(stageOrder.safeParse(["first"]).success).toBe(false);
    expect(
      stageOrder.safeParse(["0b0f1f0e-6a3c-4d1e-9a51-2f3f5c1f0a11"]).success,
    ).toBe(true);
  });
});

describe("linearEdges", () => {
  const ids = (edges: { fromStageId: string; toStageId: string }[]) =>
    edges.map((edge) => `${edge.fromStageId}>${edge.toStageId}`);

  it("leads each stage to the next, the last to every good end, and any to a lost one", () => {
    expect(
      ids(
        linearEdges([
          { id: "a", kind: "normal" },
          { id: "b", kind: "normal" },
          { id: "c", kind: "normal" },
          { id: "won", kind: "won" },
          { id: "lost", kind: "lost" },
          { id: "done", kind: "done" },
        ]),
      ),
    ).toEqual(["a>b", "a>lost", "b>c", "b>lost", "c>won", "c>lost", "c>done"]);
  });

  it("follows the stages that are not ends, wherever the ends sit in the list", () => {
    expect(
      ids(
        linearEdges([
          { id: "lost", kind: "lost" },
          { id: "a", kind: "normal" },
          { id: "won", kind: "won" },
          { id: "b", kind: "normal" },
        ]),
      ),
    ).toEqual(["a>b", "a>lost", "b>lost", "b>won"]);
  });

  it("gives no paths to a workflow of one stage, or of ends alone", () => {
    expect(linearEdges([{ id: "a", kind: "normal" }])).toEqual([]);
    expect(
      linearEdges([
        { id: "won", kind: "won" },
        { id: "lost", kind: "lost" },
      ]),
    ).toEqual([]);
  });
});

describe("workflow templates", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  async function made(name: string, stages: string[] = []) {
    const result = await createTemplate(ownerId, template(name));
    if (!result.ok) throw new Error(result.reason);
    for (const stageName of stages) {
      await addStage(ownerId, result.id, stage(stageName));
    }
    return result.id;
  }

  const read = async (id: string) => (await getTemplate(ownerId, id))!;
  // The paths of a workflow, by the names of its stages.
  async function paths(id: string) {
    const { stages, edges } = await read(id);
    const nameOf = (stageId: string) =>
      stages.find((row) => row.id === stageId)!.name;
    return edges
      .map((edge) => `${nameOf(edge.fromStageId)} > ${nameOf(edge.toStageId)}`)
      .sort();
  }

  it("creates a workflow with no stages at version 1", async () => {
    const id = await made("Onboarding");

    expect(await read(id)).toMatchObject({
      name: "Onboarding",
      description: null,
      version: 1,
      starterKey: null,
      stages: [],
      edges: [],
    });
    expect(await listTemplates(ownerId)).toEqual([
      { id, name: "Onboarding", description: null, starterKey: null, stages: [] },
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow_template.create",
      entityId: id,
    });
  });

  it("refuses a name another workflow has, whatever its capitals", async () => {
    const id = await made("Onboarding");
    const other = await made("Renewal");

    expect(await createTemplate(ownerId, template("onboarding"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect(await updateTemplate(ownerId, other, template("ONBOARDING"))).toEqual({
      ok: false,
      reason: "name_taken",
    });
    // Its own name in other capitals is a rename like any other.
    expect(await updateTemplate(ownerId, id, template("onboarding"))).toEqual({
      ok: true,
      id,
    });
  });

  it("stops at the most workflows an owner can have", async () => {
    await db.insert(workflowTemplates).values(
      Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
        ownerId,
        name: `Workflow ${index}`,
      })),
    );
    expect(await createTemplate(ownerId, template("One more"))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("renames and describes a workflow, raising its version", async () => {
    const id = await made("Onboarding");

    await updateTemplate(ownerId, id, template("Client onboarding", "First month"));

    expect(await read(id)).toMatchObject({
      name: "Client onboarding",
      description: "First month",
      version: 2,
    });
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow_template.update",
      before: { name: "Onboarding", description: null },
      after: { name: "Client onboarding", description: "First month" },
    });
  });

  it("adds stages at the end, with their paths, and gives each checklist item an id", async () => {
    const id = await made("Onboarding");

    await addStage(
      ownerId,
      id,
      stage("Welcome", {
        slaDays: 3,
        checklist: [
          { label: "Call booked", required: true },
          { label: "Gift sent", required: false },
        ],
        defaultTasks: [{ title: "Send welcome note", offsetDays: 1, priority: "high" }],
      }),
    );
    await addStage(ownerId, id, stage("Set up"));
    await addStage(ownerId, id, stage("Lost", { kind: "lost" }));
    await addStage(ownerId, id, stage("Live", { kind: "done" }));

    const { stages, version } = await read(id);
    expect(stages.map((row) => [row.position, row.name, row.kind])).toEqual([
      [0, "Welcome", "normal"],
      [1, "Set up", "normal"],
      [2, "Lost", "lost"],
      [3, "Live", "done"],
    ]);
    expect(stages[0]).toMatchObject({
      slaDays: 3,
      checklist: [
        { label: "Call booked", required: true },
        { label: "Gift sent", required: false },
      ],
      defaultTasks: [{ title: "Send welcome note", offsetDays: 1, priority: "high" }],
    });
    const [first, second] = stages[0].checklist;
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.id).not.toBe(first.id);
    expect(version).toBe(5);
    expect(await paths(id)).toEqual([
      "Set up > Live",
      "Set up > Lost",
      "Welcome > Lost",
      "Welcome > Set up",
    ]);
  });

  it("refuses a stage name the workflow already has, and a stage too many", async () => {
    const id = await made("Onboarding", ["Welcome"]);
    const other = await made("Renewal");

    expect(await addStage(ownerId, id, stage("welcome"))).toEqual({
      ok: false,
      reason: "stage_name_taken",
    });
    // Another workflow may use the name.
    expect((await addStage(ownerId, other, stage("Welcome"))).ok).toBe(true);

    // Written straight in: adding them one at a time takes longer than a test may.
    await db.insert(workflowTemplateStages).values(
      Array.from({ length: MAX_STAGES - 1 }, (_, index) => ({
        ownerId,
        templateId: id,
        name: `Stage ${index + 1}`,
        position: index + 1,
      })),
    );
    expect(await addStage(ownerId, id, stage("One more"))).toEqual({
      ok: false,
      reason: "stage_limit",
    });
  });

  it("edits a stage, keeping the ids of the checklist items it already had", async () => {
    const id = await made("Onboarding", ["Welcome", "Set up"]);
    await addStage(
      ownerId,
      id,
      stage("Review", { checklist: [{ label: "Signed off", required: true }] }),
    );
    const [, setUp, review] = (await read(id)).stages;
    const kept = review.checklist[0].id;

    expect(await updateStage(ownerId, id, review.id, stage("set up"))).toEqual({
      ok: false,
      reason: "stage_name_taken",
    });
    await updateStage(
      ownerId,
      id,
      review.id,
      stage("Final review", {
        description: "Before go-live",
        checklist: [
          { id: kept, label: "Signed off by the client", required: true },
          // An id sent twice is one item's; the second gets its own.
          { id: kept, label: "Invoice raised", required: false },
        ],
      }),
    );

    const after = (await read(id)).stages[2];
    expect(after).toMatchObject({ name: "Final review", description: "Before go-live" });
    expect(after.checklist[0]).toEqual({
      id: kept,
      label: "Signed off by the client",
      required: true,
    });
    expect(after.checklist[1].id).not.toBe(kept);

    // Turned into an end, the middle stage is off the path and can be reached from either side.
    await updateStage(ownerId, id, setUp.id, stage("Set up", { kind: "lost" }));
    expect(await paths(id)).toEqual([
      "Final review > Set up",
      "Welcome > Final review",
      "Welcome > Set up",
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow_stage.update",
      entityId: id,
      before: { kind: "normal" },
      after: { kind: "lost" },
    });
  });

  it("removes a stage and closes the gap it leaves", async () => {
    const id = await made("Onboarding", ["Welcome", "Set up", "Review"]);
    const [, setUp] = (await read(id)).stages;

    expect(await removeStage(ownerId, id, setUp.id)).toBe(true);
    expect(await removeStage(ownerId, id, setUp.id)).toBe(false);

    expect((await read(id)).stages.map((row) => [row.position, row.name])).toEqual([
      [0, "Welcome"],
      [1, "Review"],
    ]);
    expect(await paths(id)).toEqual(["Welcome > Review"]);
  });

  it("puts the stages in a new order only when given every one of them once", async () => {
    const id = await made("Onboarding", ["Welcome", "Set up", "Review"]);
    const [welcome, setUp, review] = (await read(id)).stages.map((row) => row.id);
    const before = (await read(id)).version;

    expect(await reorderStages(ownerId, id, [review, welcome])).toBe(false);
    expect(await reorderStages(ownerId, id, [review, welcome, welcome])).toBe(false);
    expect(
      await reorderStages(ownerId, id, [review, welcome, setUp, crypto.randomUUID()]),
    ).toBe(false);
    expect((await read(id)).version).toBe(before);

    expect(await reorderStages(ownerId, id, [review, welcome, setUp])).toBe(true);

    expect((await read(id)).stages.map((row) => row.name)).toEqual([
      "Review",
      "Welcome",
      "Set up",
    ]);
    expect(await paths(id)).toEqual(["Review > Welcome", "Welcome > Set up"]);
    expect((await read(id)).version).toBe(before + 1);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow_stage.reorder",
      before: { stages: ["Welcome", "Set up", "Review"] },
      after: { stages: ["Review", "Welcome", "Set up"] },
    });
  });

  it("refuses a stage of another workflow", async () => {
    const id = await made("Onboarding", ["Welcome"]);
    const other = await made("Renewal", ["Reminder"]);
    const [reminder] = (await read(other)).stages;

    expect(await updateStage(ownerId, id, reminder.id, stage("Taken over"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await removeStage(ownerId, id, reminder.id)).toBe(false);
    expect((await read(other)).stages.map((row) => row.name)).toEqual(["Reminder"]);
  });

  it("deletes a workflow with its stages and paths", async () => {
    const id = await made("Onboarding", ["Welcome", "Set up"]);

    expect((await listTemplates(ownerId))[0].stages).toEqual([
      { name: "Welcome", kind: "normal" },
      { name: "Set up", kind: "normal" },
    ]);
    expect(await deleteTemplate(ownerId, id)).toBe(true);
    expect(await deleteTemplate(ownerId, id)).toBe(false);

    expect(await getTemplate(ownerId, id)).toBeNull();
    expect(await listTemplates(ownerId)).toEqual([]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow_template.delete",
      before: { name: "Onboarding", stages: [{ name: "Welcome" }, { name: "Set up" }] },
    });
  });

  describe("starters", () => {
    it("every starter passes the rules a workflow made by hand does", () => {
      for (const starter of STARTER_TEMPLATES) {
        expect(
          templateInput.safeParse({
            name: starter.name,
            description: starter.description,
          }).success,
          starter.key,
        ).toBe(true);
        for (const starterStage of starter.stages) {
          expect(
            stageInput.safeParse(starterStage).success,
            `${starter.key}: ${starterStage.name}`,
          ).toBe(true);
        }
        const names = starter.stages.map((row) => row.name.toLowerCase());
        expect(new Set(names).size, starter.key).toBe(names.length);
      }
    });

    it("adds Prospecting with its stages, paths, checklist and first task", async () => {
      const result = await addStarterTemplate(ownerId, "prospecting");
      if (!result.ok) throw new Error(result.reason);

      const added = await read(result.id);
      expect(added).toMatchObject({
        name: "Prospecting",
        version: 1,
        starterKey: "prospecting",
      });
      expect(added.stages.map((row) => [row.name, row.kind])).toEqual([
        ["Identified", "normal"],
        ["Contacted", "normal"],
        ["In conversation", "normal"],
        ["Proposal sent", "normal"],
        ["Won", "won"],
        ["Lost", "lost"],
      ]);
      expect(added.stages[0]).toMatchObject({
        slaDays: 7,
        checklist: [{ label: "Right person found", required: true }],
        defaultTasks: [
          { title: "Research and find the right person", offsetDays: 0, priority: "normal" },
        ],
      });
      expect(added.stages[0].checklist[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await paths(result.id)).toEqual([
        "Contacted > In conversation",
        "Contacted > Lost",
        "Identified > Contacted",
        "Identified > Lost",
        "In conversation > Lost",
        "In conversation > Proposal sent",
        "Proposal sent > Lost",
        "Proposal sent > Won",
      ]);
    });

    it("adds a starter once, and only one this app offers", async () => {
      const first = await addStarterTemplate(ownerId, "website_project");
      if (!first.ok) throw new Error(first.reason);

      // Renamed, it is still the starter it was added from.
      await updateTemplate(ownerId, first.id, template("Web build"));
      expect(await addStarterTemplate(ownerId, "website_project")).toEqual({
        ok: false,
        reason: "already_added",
      });
      expect(await addStarterTemplate(ownerId, "anything_else")).toEqual({
        ok: false,
        reason: "not_found",
      });

      // Deleted, it is offered and can be added again.
      await deleteTemplate(ownerId, first.id);
      expect((await addStarterTemplate(ownerId, "website_project")).ok).toBe(true);
    });

    it("refuses a starter whose name a workflow of the owner's already has", async () => {
      await made("prospecting");
      expect(await addStarterTemplate(ownerId, "prospecting")).toEqual({
        ok: false,
        reason: "name_taken",
      });
    });
  });

  it("keeps one owner's workflows from another", async () => {
    const id = await made("Onboarding", ["Welcome", "Set up"]);
    const [welcome, setUp] = (await read(id)).stages.map((row) => row.id);
    const stranger = await createTestOwner("stranger@example.com");

    expect(await getTemplate(stranger, id)).toBeNull();
    expect(await listTemplates(stranger)).toEqual([]);
    expect(await updateTemplate(stranger, id, template("Taken"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await addStage(stranger, id, stage("Extra"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await updateStage(stranger, id, welcome, stage("Taken"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await removeStage(stranger, id, welcome)).toBe(false);
    expect(await reorderStages(stranger, id, [setUp, welcome])).toBe(false);
    expect(await deleteTemplate(stranger, id)).toBe(false);
    // The same name is theirs to use.
    expect((await createTemplate(stranger, template("Onboarding"))).ok).toBe(true);

    expect(await read(id)).toMatchObject({ name: "Onboarding", version: 3 });
    expect((await read(id)).stages.map((row) => row.name)).toEqual(["Welcome", "Set up"]);
  });
});
