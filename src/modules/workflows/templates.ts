import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  workflowTemplateEdges,
  workflowTemplates,
  workflowTemplateStages,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { linearEdges } from "./edges";
import {
  MAX_STAGES,
  MAX_TEMPLATES,
  type StageInput,
  type TemplateInput,
} from "./schema";
import { STARTER_TEMPLATES } from "./starters";

export type TemplateResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | "limit"
        | "name_taken"
        | "already_added"
        | "stage_limit"
        | "stage_name_taken"
        | "not_found";
    };

type StageRow = typeof workflowTemplateStages.$inferSelect;

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const owned = (ownerId: string, id: string) =>
  and(eq(workflowTemplates.ownerId, ownerId), eq(workflowTemplates.id, id));

const snapshot = (stage: StageRow) => ({
  name: stage.name,
  description: stage.description,
  kind: stage.kind,
  slaDays: stage.slaDays,
  checklist: stage.checklist,
  defaultTasks: stage.defaultTasks,
});

// Held for the length of a change, so two edits of one workflow cannot interleave.
async function lockTemplate(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(workflowTemplates)
    .where(owned(ownerId, id))
    .for("update");
  return row;
}

const stagesOf = (tx: Tx, templateId: string) =>
  tx
    .select()
    .from(workflowTemplateStages)
    .where(eq(workflowTemplateStages.templateId, templateId))
    .orderBy(asc(workflowTemplateStages.position));

const namesOf = (tx: Tx, ownerId: string) =>
  tx
    .select({ id: workflowTemplates.id, name: workflowTemplates.name })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.ownerId, ownerId));

function stageColumns(input: StageInput) {
  const seen = new Set<string>();
  return {
    name: input.name,
    description: input.description,
    kind: input.kind,
    slaDays: input.slaDays,
    checklist: input.checklist.map(({ id, label, required }) => {
      const kept = id && !seen.has(id) ? id : randomUUID();
      seen.add(kept);
      return { id: kept, label, required };
    }),
    defaultTasks: input.defaultTasks,
  };
}

const bump = (tx: Tx, ownerId: string, id: string) =>
  tx
    .update(workflowTemplates)
    .set({ version: sql`${workflowTemplates.version} + 1` })
    .where(owned(ownerId, id));

// The paths follow the stages, so they are worked out again whenever a stage
// is added, removed, moved or changes kind.
async function repath(tx: Tx, ownerId: string, templateId: string) {
  await tx
    .delete(workflowTemplateEdges)
    .where(eq(workflowTemplateEdges.templateId, templateId));
  const edges = linearEdges(await stagesOf(tx, templateId));
  if (edges.length > 0) {
    await tx
      .insert(workflowTemplateEdges)
      .values(edges.map((edge) => ({ ownerId, templateId, ...edge })));
  }
}

async function insertTemplate(
  tx: Tx,
  ownerId: string,
  input: TemplateInput,
  starterKey: string | null,
): Promise<TemplateResult> {
  const existing = await namesOf(tx, ownerId);
  if (existing.length >= MAX_TEMPLATES) return { ok: false, reason: "limit" };
  if (existing.some(({ name }) => sameText(name, input.name))) {
    return { ok: false, reason: "name_taken" };
  }
  const [row] = await tx
    .insert(workflowTemplates)
    .values({ ownerId, ...input, starterKey })
    .returning({ id: workflowTemplates.id });
  return { ok: true, id: row.id };
}

export async function createTemplate(
  ownerId: string,
  input: TemplateInput,
): Promise<TemplateResult> {
  return db.transaction(async (tx) => {
    const result = await insertTemplate(tx, ownerId, input, null);
    if (result.ok) {
      await audit(tx, {
        ownerId,
        actor: "user",
        action: "workflow_template.create",
        entityType: "workflow_template",
        entityId: result.id,
        after: input,
      });
    }
    return result;
  });
}

// The workflow is the one this app offers under that key, whatever else was sent.
export async function addStarterTemplate(
  ownerId: string,
  key: string,
): Promise<TemplateResult> {
  const starter = STARTER_TEMPLATES.find((template) => template.key === key);
  if (!starter) return { ok: false, reason: "not_found" };

  return db.transaction(async (tx) => {
    const [added] = await tx
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.ownerId, ownerId),
          eq(workflowTemplates.starterKey, key),
        ),
      );
    if (added) return { ok: false, reason: "already_added" };

    const result = await insertTemplate(
      tx,
      ownerId,
      { name: starter.name, description: starter.description },
      key,
    );
    if (!result.ok) return result;

    await tx.insert(workflowTemplateStages).values(
      starter.stages.map((stage, position) => ({
        ownerId,
        templateId: result.id,
        position,
        ...stageColumns(stage),
      })),
    );
    await repath(tx, ownerId, result.id);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_template.create",
      entityType: "workflow_template",
      entityId: result.id,
      after: {
        name: starter.name,
        starterKey: key,
        stages: starter.stages.map((stage) => stage.name),
      },
    });
    return result;
  });
}

export async function updateTemplate(
  ownerId: string,
  id: string,
  input: TemplateInput,
): Promise<TemplateResult> {
  return db.transaction(async (tx) => {
    const before = await lockTemplate(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    const existing = await namesOf(tx, ownerId);
    if (
      existing.some(
        (other) => other.id !== id && sameText(other.name, input.name),
      )
    ) {
      return { ok: false, reason: "name_taken" };
    }

    await tx.update(workflowTemplates).set(input).where(owned(ownerId, id));
    await bump(tx, ownerId, id);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_template.update",
      entityType: "workflow_template",
      entityId: id,
      before: { name: before.name, description: before.description },
      after: input,
    });
    return { ok: true, id };
  });
}

// Workflows already running were copied from it and go on as they are.
export async function deleteTemplate(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockTemplate(tx, ownerId, id);
    if (!before) return false;
    const stages = await stagesOf(tx, id);
    await tx.delete(workflowTemplates).where(owned(ownerId, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_template.delete",
      entityType: "workflow_template",
      entityId: id,
      before: {
        name: before.name,
        description: before.description,
        stages: stages.map(snapshot),
      },
    });
    return true;
  });
}

// A workflow tells its stages apart by name: on its roadmap, and on the buttons that move it.
const stageNameTaken = (stages: StageRow[], name: string, exceptId?: string) =>
  stages.some((stage) => stage.id !== exceptId && sameText(stage.name, name));

export async function addStage(
  ownerId: string,
  templateId: string,
  input: StageInput,
): Promise<TemplateResult> {
  return db.transaction(async (tx) => {
    if (!(await lockTemplate(tx, ownerId, templateId))) {
      return { ok: false, reason: "not_found" };
    }
    const stages = await stagesOf(tx, templateId);
    if (stages.length >= MAX_STAGES) return { ok: false, reason: "stage_limit" };
    if (stageNameTaken(stages, input.name)) {
      return { ok: false, reason: "stage_name_taken" };
    }

    const [row] = await tx
      .insert(workflowTemplateStages)
      .values({
        ownerId,
        templateId,
        position: stages.length,
        ...stageColumns(input),
      })
      .returning();
    await repath(tx, ownerId, templateId);
    await bump(tx, ownerId, templateId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_stage.create",
      entityType: "workflow_template",
      entityId: templateId,
      after: { stageId: row.id, ...snapshot(row) },
    });
    return { ok: true, id: row.id };
  });
}

export async function updateStage(
  ownerId: string,
  templateId: string,
  stageId: string,
  input: StageInput,
): Promise<TemplateResult> {
  return db.transaction(async (tx) => {
    if (!(await lockTemplate(tx, ownerId, templateId))) {
      return { ok: false, reason: "not_found" };
    }
    const stages = await stagesOf(tx, templateId);
    const before = stages.find((stage) => stage.id === stageId);
    if (!before) return { ok: false, reason: "not_found" };
    if (stageNameTaken(stages, input.name, stageId)) {
      return { ok: false, reason: "stage_name_taken" };
    }

    const [row] = await tx
      .update(workflowTemplateStages)
      .set(stageColumns(input))
      .where(eq(workflowTemplateStages.id, stageId))
      .returning();
    await repath(tx, ownerId, templateId);
    await bump(tx, ownerId, templateId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_stage.update",
      entityType: "workflow_template",
      entityId: templateId,
      before: { stageId, ...snapshot(before) },
      after: { stageId, ...snapshot(row) },
    });
    return { ok: true, id: stageId };
  });
}

const place = (tx: Tx, stageId: string, position: number) =>
  tx
    .update(workflowTemplateStages)
    .set({ position })
    .where(eq(workflowTemplateStages.id, stageId));

export async function removeStage(
  ownerId: string,
  templateId: string,
  stageId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockTemplate(tx, ownerId, templateId))) return false;
    const stages = await stagesOf(tx, templateId);
    const before = stages.find((stage) => stage.id === stageId);
    if (!before) return false;

    await tx
      .delete(workflowTemplateStages)
      .where(eq(workflowTemplateStages.id, stageId));
    const left = stages.filter((stage) => stage.id !== stageId);
    for (const [position, stage] of left.entries()) {
      if (stage.position !== position) await place(tx, stage.id, position);
    }
    await repath(tx, ownerId, templateId);
    await bump(tx, ownerId, templateId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_stage.delete",
      entityType: "workflow_template",
      entityId: templateId,
      before: { stageId, ...snapshot(before) },
    });
    return true;
  });
}

// `stageIds` is every stage of the workflow, in its new order; anything else is refused.
export async function reorderStages(
  ownerId: string,
  templateId: string,
  stageIds: string[],
) {
  return db.transaction(async (tx) => {
    if (!(await lockTemplate(tx, ownerId, templateId))) return false;
    const stages = await stagesOf(tx, templateId);
    const asked = new Set(stageIds);
    if (
      asked.size !== stageIds.length ||
      asked.size !== stages.length ||
      !stages.every((stage) => asked.has(stage.id))
    ) {
      return false;
    }

    for (const [position, stageId] of stageIds.entries()) {
      await place(tx, stageId, position);
    }
    await repath(tx, ownerId, templateId);
    await bump(tx, ownerId, templateId);
    const nameOf = (id: string) => stages.find((stage) => stage.id === id)!.name;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow_stage.reorder",
      entityType: "workflow_template",
      entityId: templateId,
      before: { stages: stages.map((stage) => stage.name) },
      after: { stages: stageIds.map(nameOf) },
    });
    return true;
  });
}
