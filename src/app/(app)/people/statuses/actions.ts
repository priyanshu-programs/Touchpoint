"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  MAX_COMPANY_STATUSES,
  statusColor,
  statusInput,
} from "@/modules/statuses/schema";
import {
  createCompanyStatus,
  deleteCompanyStatus,
  renameCompanyStatus,
  setCompanyStatusColor,
  type CompanyStatusResult,
} from "@/modules/statuses/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

const statusKey = z.string().min(1).max(60);

function failure(
  result: Exclude<CompanyStatusResult, { ok: true }>,
  label: string,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `You can have at most ${MAX_COMPANY_STATUSES} statuses of your own.`,
    label_taken: `There is already a status called ${label}.`,
    built_in: "A built-in status keeps its name.",
  }[result.reason];
  return { ok: false, message, values };
}

export async function createCompanyStatusAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["label", "color"]);
  const parsed = statusInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createCompanyStatus(owner.id, parsed.data);
  if (!result.ok) return failure(result, parsed.data.label, values);

  revalidatePath("/people", "layout");
  return { ok: true, message: `${parsed.data.label} added.` };
}

export async function renameCompanyStatusAction(
  key: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["label"]);
  const parsed = statusInput.shape.label.safeParse(values.label);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await renameCompanyStatus(
    owner.id,
    statusKey.parse(key),
    parsed.data,
  );
  if (!result.ok) return failure(result, parsed.data, values);

  revalidatePath("/people", "layout");
  return { ok: true, message: "Saved." };
}

export async function setCompanyStatusColorAction(key: string, color: string) {
  const owner = await requireOwner();
  const changed = await setCompanyStatusColor(
    owner.id,
    statusKey.parse(key),
    statusColor.parse(color),
  );
  if (!changed) notFound();
  revalidatePath("/people", "layout");
}

export async function deleteCompanyStatusAction(formData: FormData) {
  const owner = await requireOwner();
  const result = await deleteCompanyStatus(
    owner.id,
    statusKey.parse(formData.get("key")),
  );
  if (!result.ok) notFound();
  revalidatePath("/people", "layout");
}
