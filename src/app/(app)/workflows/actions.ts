"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  MAX_STAGES,
  MAX_TEMPLATES,
  stageInput,
  stageOrder,
  templateInput,
} from "@/modules/workflows/schema";
import { STARTER_TEMPLATES } from "@/modules/workflows/starters";
import {
  addStage,
  addStarterTemplate,
  createTemplate,
  deleteTemplate,
  removeStage,
  reorderStages,
  updateStage,
  updateTemplate,
  type TemplateResult,
} from "@/modules/workflows/templates";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

function failure(
  result: Exclude<TemplateResult, { ok: true }>,
  name: string,
  values?: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `You can have at most ${MAX_TEMPLATES} workflows.`,
    name_taken: `There is already a workflow called ${name}.`,
    already_added: `${name} is already among your workflows.`,
    stage_limit: `A workflow has at most ${MAX_STAGES} stages.`,
    stage_name_taken: `This workflow already has a stage called ${name}.`,
  }[result.reason];
  return { ok: false, message, values };
}

export async function createTemplateAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = templateInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createTemplate(owner.id, parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidatePath("/workflows", "layout");
  redirect(`/workflows/${result.id}`);
}

// The form names a starter by its key; what the workflow is comes from the server's list.
export async function addStarterTemplateAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const key = z.string().max(60).parse(formData.get("key"));
  const result = await addStarterTemplate(owner.id, key);
  if (!result.ok) {
    return failure(
      result,
      STARTER_TEMPLATES.find((starter) => starter.key === key)?.name ?? key,
    );
  }

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Workflow added." };
}

export async function updateTemplateAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = templateInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateTemplate(owner.id, z.uuid().parse(id), parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteTemplateAction(formData: FormData) {
  const owner = await requireOwner();
  const deleted = await deleteTemplate(
    owner.id,
    z.uuid().parse(formData.get("id")),
  );
  if (!deleted) notFound();
  revalidatePath("/workflows", "layout");
  redirect("/workflows");
}

// A stage is sent whole, as the form holds it: a new one when no stage is named.
export async function saveStageAction(
  templateId: string,
  stageId: string | null,
  stage: unknown,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const template = z.uuid().parse(templateId);
  const parsed = stageInput.safeParse(stage);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const result = stageId
    ? await updateStage(owner.id, template, z.uuid().parse(stageId), parsed.data)
    : await addStage(owner.id, template, parsed.data);
  if (!result.ok) return failure(result, parsed.data.name);

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Saved." };
}

export async function removeStageAction(formData: FormData) {
  const owner = await requireOwner();
  const removed = await removeStage(
    owner.id,
    z.uuid().parse(formData.get("templateId")),
    z.uuid().parse(formData.get("stageId")),
  );
  if (!removed) notFound();
  revalidatePath("/workflows", "layout");
}

export async function reorderStagesAction(templateId: string, stageIds: unknown) {
  const owner = await requireOwner();
  const reordered = await reorderStages(
    owner.id,
    z.uuid().parse(templateId),
    stageOrder.parse(stageIds),
  );
  if (!reordered) notFound();
  revalidatePath("/workflows", "layout");
}
