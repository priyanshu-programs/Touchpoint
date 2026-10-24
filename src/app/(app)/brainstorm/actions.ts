"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  brainstormIcon,
  brainstormName,
  MAX_BRAINSTORM_BOARDS,
} from "@/modules/brainstorm/schema";
import {
  createBrainstorm,
  deleteBrainstorm,
  renameBrainstorm,
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

export async function deleteBrainstormAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await deleteBrainstorm(owner.id, id))) notFound();
  revalidatePath("/brainstorm", "layout");
  redirect("/brainstorm");
}
