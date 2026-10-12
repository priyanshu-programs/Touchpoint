import { readFields } from "@/lib/form";
import { formatCustomValue } from "@/modules/fields/format";
import { listCustomFields, type CustomField } from "@/modules/fields/queries";
import {
  customKey,
  customValuesInput,
  type CustomValues,
  type EntityType,
} from "@/modules/fields/schema";
import type { CustomFormField } from "./custom-inputs";

// The owner's own fields as an Edit form shows them, named as the form sends them.
export const customFormFields = (fields: CustomField[]): CustomFormField[] =>
  fields.map(({ key, label, type, options }) => ({
    name: customKey(key),
    label,
    type,
    options,
  }));

export const customFormValues = (fields: CustomField[], custom: CustomValues) =>
  Object.fromEntries(
    fields.map(({ key }) => [customKey(key), String(custom[key] ?? "")]),
  );

// A Details row for each of the owner's own fields, under the key its layout uses.
export const customDetailRows = (fields: CustomField[], custom: CustomValues) =>
  Object.fromEntries(
    fields.map(({ key, type }) => [
      customKey(key),
      { value: formatCustomValue(type, custom[key]) },
    ]),
  );

// Only the fields the owner has are read from the form; `typed` is what was
// entered for them, to hand back when the form is rejected.
export async function readCustomValues(
  ownerId: string,
  entityType: EntityType,
  formData: FormData,
) {
  const fields = await listCustomFields(ownerId, entityType);
  const typed = readFields(
    formData,
    fields.map(({ key }) => customKey(key)),
  );
  const parsed = customValuesInput(fields).safeParse(
    Object.fromEntries(fields.map(({ key }) => [key, typed[customKey(key)]])),
  );
  return { typed, parsed };
}
