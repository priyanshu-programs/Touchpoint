"use client";

import { useActionState } from "react";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  SelectField,
  TextareaField,
  TextField,
  type Option,
} from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";

export function MaterialForm({
  action,
  initial,
  types,
  firstVersion,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  types: Option[];
  // A new material may start with a link; a file is added on its page.
  firstVersion?: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? initial;

  return (
    // Remounting on new values is what makes selects show them after a rejected submit.
    <form
      key={JSON.stringify(values)}
      action={formAction}
      className="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <TextField
          name="name"
          label="Name"
          placeholder="Rate card"
          defaultValue={values.name}
          maxLength={200}
          required
        />
        <SelectField
          name="type"
          label="Type"
          options={types}
          defaultValue={values.type}
        />
      </div>
      <TextareaField
        name="description"
        label="Description"
        hint="What it is and when you send it."
        defaultValue={values.description}
        maxLength={2000}
      />
      {firstVersion && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <TextField
            name="url"
            label="Link (optional)"
            placeholder="https://"
            hint="Where it lives now, such as a Google Drive or Canva link. You can upload a file once the material is made."
            defaultValue={values.url}
            maxLength={2000}
          />
          <TextField
            name="label"
            label="Version"
            placeholder="v1"
            defaultValue={values.label}
            maxLength={100}
          />
        </div>
      )}

      <FormOutcome state={state} />
      <FormButtons
        state={state}
        pending={pending}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
      />
    </form>
  );
}
