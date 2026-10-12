import { SECTION_HEADING } from "@/components/detail-rows";
import { SelectField, TextField } from "@/components/fields";

export type CustomFormField = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "date";
  options: string[];
};

// The owner's own fields on an Edit form, each with the input its kind takes.
export function CustomFieldInputs({
  fields,
  values,
}: {
  fields: CustomFormField[];
  values: Record<string, string>;
}) {
  if (fields.length === 0) return null;

  return (
    <fieldset className="grid gap-3">
      <legend className={`${SECTION_HEADING} mb-3`}>Custom fields</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) =>
          field.type === "select" ? (
            <SelectField
              key={field.name}
              name={field.name}
              label={field.label}
              options={field.options.map((option) => ({
                value: option,
                label: option,
              }))}
              blank="Not set"
              defaultValue={values[field.name]}
            />
          ) : (
            <TextField
              key={field.name}
              name={field.name}
              label={field.label}
              type={field.type}
              step={field.type === "number" ? "any" : undefined}
              defaultValue={values[field.name]}
            />
          ),
        )}
      </div>
    </fieldset>
  );
}
