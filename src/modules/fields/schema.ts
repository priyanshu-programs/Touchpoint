import { z } from "zod";
import {
  CUSTOM_FIELD_TYPES,
  FIELD_ENTITY_TYPES,
  type CustomValues,
} from "@/db/schema";
import { blankToNull, text } from "@/lib/form";

export { CUSTOM_FIELD_TYPES, FIELD_ENTITY_TYPES };
export type { CustomValues };
export type EntityType = (typeof FIELD_ENTITY_TYPES)[number];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const MAX_CUSTOM_FIELDS = 50;
export const MAX_OPTIONS = 30;

// A custom field sits in a layout under this prefix, which no standard key has.
const CUSTOM_PREFIX = "custom.";
export const customKey = (key: string) => `${CUSTOM_PREFIX}${key}`;
export const isCustomKey = (key: string) => key.startsWith(CUSTOM_PREFIX);

export const layoutInput = z
  .array(
    z.strictObject({ key: z.string().min(1).max(60), hidden: z.boolean() }),
  )
  .max(100)
  .refine(
    (fields) => new Set(fields.map(({ key }) => key)).size === fields.length,
    { message: "A field is listed twice" },
  );

export type LayoutInput = z.infer<typeof layoutInput>;

const label = z.string().trim().min(1, "Give the field a name").max(60);
const options = z
  .array(z.string().trim().min(1).max(60))
  .max(MAX_OPTIONS, `A field can offer at most ${MAX_OPTIONS} options`)
  .refine(
    (values) =>
      new Set(values.map((value) => value.toLowerCase())).size === values.length,
    { message: "An option is listed twice" },
  );

export const customFieldInput = z
  .strictObject({ label, type: z.enum(CUSTOM_FIELD_TYPES), options })
  .refine((field) => field.type !== "select" || field.options.length > 0, {
    message: "List at least one option to choose from",
  })
  .refine((field) => field.type === "select" || field.options.length === 0, {
    message: "Only a field of options takes a list of them",
  });

// `options` are added to the ones a select already offers; none are removed.
export const customFieldChange = z.strictObject({ label, options });

export type CustomFieldInput = z.infer<typeof customFieldInput>;
export type CustomFieldChange = z.infer<typeof customFieldChange>;

type Definition = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: readonly string[];
};

function valueOf(field: Definition) {
  if (field.type === "number") {
    return z
      .string()
      .trim()
      .refine((value) => Number.isFinite(Number(value)), {
        message: `${field.label} takes a number`,
      })
      .transform(Number);
  }
  if (field.type === "select") {
    return z.string().refine((value) => field.options.includes(value), {
      message: `Choose one of the options for ${field.label}`,
    });
  }
  if (field.type === "date") {
    return z.iso.date(`${field.label} takes a date`);
  }
  return text(500);
}

// What a form may say for the fields the owner has: a value of each field's own
// kind or nothing, and no key besides theirs. Blank fields are left out.
export function customValuesInput(fields: readonly Definition[]) {
  return z
    .strictObject(
      Object.fromEntries(
        fields.map((field) => [field.key, blankToNull(valueOf(field))]),
      ),
    )
    .transform(
      (values) =>
        Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== null),
        ) as CustomValues,
    );
}
