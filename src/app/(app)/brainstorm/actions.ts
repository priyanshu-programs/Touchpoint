"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { openPictures } from "@/modules/brainstorm/pictures";
import {
  brainstormIcon,
  brainstormName,
  brainstormOrder,
  MAX_BRAINSTORM_BOARDS,
} from "@/modules/brainstorm/schema";
import {
  createBrainstorm,
  deleteBrainstorm,
  pruneBrainstorm,
  renameBrainstorm,
  reorderBrainstorms,
  setBrainstormIcon,
  type BrainstormResult,
} from "@/modules/brainstorm/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

function failure(
  result: Exclude<BrainstormResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `You can have at most ${MAX_BRAINSTORM_BOARDS} brainstorm boards. Delete one you no longer need first.`,
    name_taken: `You already have a board called ${values.name}.`,
  }[result.reason];
  return { ok: false, message, values };
}

export async function createBrainstormAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name"]);
  const parsed = brainstormName.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createBrainstorm(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  revalidatePath("/brainstorm", "layout");
  redirect(`/brainstorm/${result.id}`);
}

export async function renameBrainstormAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name"]);
  const parsed = brainstormName.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await renameBrainstorm(owner.id, z.uuid().parse(id), parsed.data);
  if (!result.ok) return failure(result, values);

  revalidatePath("/brainstorm", "layout");
  return { ok: true, message: "Saved." };
}

export async function setBrainstormIconAction(boardId: string, icon: string | null) {
  const owner = await requireOwner();
  if (!(await setBrainstormIcon(owner.id, brainstormIcon.parse({ boardId, icon })))) {
    notFound();
  }
  revalidatePath("/brainstorm", "layout");
}

export async function reorderBrainstormsAction(ids: string[]) {
  const owner = await requireOwner();
  if (!(await reorderBrainstorms(owner.id, brainstormOrder.parse(ids)))) notFound();
  revalidatePath("/brainstorm", "layout");
}

// The ids of the pictures drawn on a board, asked for as its whiteboard opens,
// when elements deleted long ago are cleared away too.
export async function openBrainstormAction(boardId: string) {
  const owner = await requireOwner();
  const id = z.uuid().parse(boardId);
  const pictures = await openPictures(owner.id, id);
  if (!pictures) notFound();
  await pruneBrainstorm(owner.id, id);
  return { pictures };
}

export async function deleteBrainstormAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await deleteBrainstorm(owner.id, id))) notFound();
  revalidatePath("/brainstorm", "layout");
  redirect("/brainstorm");
}
