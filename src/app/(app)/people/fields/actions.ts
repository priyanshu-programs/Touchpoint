"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  customFieldChange,
  customFieldInput,
  FIELD_ENTITY_TYPES,
  layoutInput,
  MAX_CUSTOM_FIELDS,
  MAX_OPTIONS,
} from "@/modules/fields/schema";
import {
  addSuggestedField,
  createCustomField,
  deleteCustomField,
  removeCustomFieldOption,
  saveLayout,
  updateCustomField,
  type CustomFieldResult,
} from "@/modules/fields/service";
import { SUGGESTED_FIELDS } from "@/modules/fields/suggested";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

const entity = z.enum(FIELD_ENTITY_TYPES);

// Options are typed one to a line.
const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function failure(
  result: Exclude<CustomFieldResult, { ok: true }>,
  label: string,
  values?: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `A record can have at most ${MAX_CUSTOM_FIELDS} fields of your own.`,
    label_taken: `There is already a field called ${label}.`,
    too_many_options: `A field can offer at most ${MAX_OPTIONS} options.`,
  }[result.reason];
  return { ok: false, message, values };
}

export async function saveFieldLayoutAction(entityType: string, fields: unknown) {
  const owner = await requireOwner();
  const saved = await saveLayout(
    owner.id,
    entity.parse(entityType),
    layoutInput.parse(fields),
  );
  if (!saved) notFound();
  revalidatePath("/people", "layout");
}

export async function createCustomFieldAction(
  entityType: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["label", "type", "options"]);
  const parsed = customFieldInput.safeParse({
    label: values.label,
    type: values.type,
    options: values.type === "select" ? lines(values.options) : [],
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createCustomField(
    owner.id,
    entity.parse(entityType),
    parsed.data,
  );
  if (!result.ok) return failure(result, parsed.data.label, values);

  revalidatePath("/people", "layout");
  return { ok: true, message: `${parsed.data.label} added.` };
}

// The form names a suggestion by its key; what the field is comes from the server's list.
export async function addSuggestedFieldAction(
  entityType: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const kind = entity.parse(entityType);
  const key = z.string().max(60).parse(formData.get("key"));
  const result = await addSuggestedField(owner.id, kind, key);
  if (!result.ok) {
    return failure(
      result,
      SUGGESTED_FIELDS[kind].find((field) => field.key === key)?.label ?? key,
    );
  }

  revalidatePath("/people", "layout");
  return { ok: true, message: "Field added." };
}

export async function updateCustomFieldAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["label", "options"]);
  const parsed = customFieldChange.safeParse({
    label: values.label,
    options: lines(values.options),
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateCustomField(
    owner.id,
    z.uuid().parse(id),
    parsed.data,
  );
  if (!result.ok) return failure(result, parsed.data.label, values);

  revalidatePath("/people", "layout");
  return { ok: true, message: "Saved." };
}

export async function removeFieldOptionAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const { option } = z
    .strictObject({ option: z.string().trim().min(1).max(60) })
    .parse({ option: formData.get("option") });
  const result = await removeCustomFieldOption(
    owner.id,
    z.uuid().parse(id),
    option,
  );
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      ok: false,
      message:
        result.reason === "last_option"
          ? "A dropdown needs at least one option."
          : `${option} is no longer one of its options.`,
    };
  }

  revalidatePath("/people", "layout");
  return { ok: true, message: `${option} removed.` };
}

export async function deleteCustomFieldAction(formData: FormData) {
  const owner = await requireOwner();
  const deleted = await deleteCustomField(
    owner.id,
    z.uuid().parse(formData.get("id")),
  );
  if (!deleted) notFound();
  revalidatePath("/people", "layout");
}
