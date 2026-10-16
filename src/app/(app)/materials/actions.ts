"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  MAX_MATERIALS,
  materialInput,
  newMaterialInput,
  versionLink,
  versionRef,
} from "@/modules/materials/schema";
import {
  addVersionLink,
  createMaterial,
  deleteMaterial,
  removeVersion,
  updateMaterial,
  type MaterialResult,
} from "@/modules/materials/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { materialHref, VERSION_REFUSALS } from "./labels";

const FIELDS = ["name", "type", "description"] as const;

function refresh() {
  revalidatePath("/materials", "layout");
}

// An address typed without its start is taken as a web address; no other kind
// of link survives the check that follows.
const withScheme = (address: string) => {
  const typed = address.trim();
  return !typed || /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
};

function failure(
  result: Exclude<MaterialResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  return {
    ok: false,
    message:
      result.reason === "limit"
        ? `You have ${MAX_MATERIALS} materials, the most there can be. Delete one you no longer need first.`
        : "You already have a material with that name. Choose another.",
    values,
  };
}

export async function createMaterialAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, [...FIELDS, "url", "label"]);
  const parsed = newMaterialInput.safeParse({ ...values, url: withScheme(values.url) });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createMaterial(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  redirect(materialHref(result.id));
}

export async function updateMaterialAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const materialId = z.uuid().parse(id);
  const values = readFields(formData, FIELDS);
  const parsed = materialInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateMaterial(owner.id, materialId, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  redirect(materialHref(materialId));
}

export async function deleteMaterialAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await deleteMaterial(owner.id, id))) notFound();
  refresh();
  redirect("/materials");
}

export type VersionOutcome = { ok: true } | { ok: false; message: string };

export async function addVersionLinkAction(
  id: string,
  link: { label: string; url: string },
): Promise<VersionOutcome> {
  const owner = await requireOwner();
  const materialId = z.uuid().parse(id);
  // Whatever else the browser sent along is kept, so the strict check refuses it.
  const parsed = versionLink.safeParse({
    ...link,
    url: typeof link?.url === "string" ? withScheme(link.url) : link?.url,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const result = await addVersionLink(owner.id, materialId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { ok: false, message: VERSION_REFUSALS[result.reason] };
  }
  refresh();
  return { ok: true };
}

export async function removeVersionAction(formData: FormData) {
  const owner = await requireOwner();
  const ref = versionRef.parse(readFields(formData, ["materialId", "versionId"]));
  if (!(await removeVersion(owner.id, ref))) notFound();
  refresh();
}
