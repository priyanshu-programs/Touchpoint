"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  addStarterBoard,
  createBoard,
  deleteBoard,
  updateBoard,
  type BoardResult,
} from "@/modules/workflows/boards";
import { boardInput, MAX_TEMPLATES } from "@/modules/workflows/schema";
import { STARTER_BOARDS } from "@/modules/workflows/starters";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

function failure(
  result: Exclude<BoardResult, { ok: true }>,
  name: string,
  values?: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `You can have at most ${MAX_TEMPLATES} workflows.`,
    name_taken: `There is already a workflow called ${name}.`,
    already_added: `${name} is already among your workflows.`,
  }[result.reason];
  return { ok: false, message, values };
}

export async function createBoardAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = boardInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createBoard(owner.id, parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidatePath("/workflows", "layout");
  redirect(`/workflows/${result.id}`);
}

// The form names a starter by its key; what the workflow is comes from the server's list.
export async function addStarterBoardAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const key = z.string().max(60).parse(formData.get("key"));
  const result = await addStarterBoard(owner.id, key);
  if (!result.ok) {
    return failure(
      result,
      STARTER_BOARDS.find((starter) => starter.key === key)?.name ?? key,
    );
  }

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Workflow added." };
}

export async function updateBoardAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = boardInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateBoard(owner.id, z.uuid().parse(id), parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteBoardAction(formData: FormData) {
  const owner = await requireOwner();
  const deleted = await deleteBoard(
    owner.id,
    z.uuid().parse(formData.get("id")),
  );
  if (!deleted) notFound();
  revalidatePath("/workflows", "layout");
  redirect("/workflows");
}
