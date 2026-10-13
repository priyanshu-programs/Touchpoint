"use client";

import { useActionState } from "react";
import { TextareaField, TextField } from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import type { RecordFormState } from "@/app/(app)/form-state";

export function TemplateForm({
  action,
  initial,
  submitLabel,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: { name: string; description: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? initial;

  return (
    <form
      key={JSON.stringify(values)}
      action={formAction}
      className="grid gap-4"
    >
      <TextField
        name="name"
        label="Name"
        defaultValue={values.name}
        maxLength={80}
        required
      />
      <TextareaField
        name="description"
        label="Description"
        hint="What the workflow is for. Optional."
        rows={2}
        defaultValue={values.description}
      />
      <FormOutcome state={state} />
      <FormButtons
        state={state}
        pending={pending}
        submitLabel={submitLabel}
        cancelHref="/workflows"
      />
    </form>
  );
}
