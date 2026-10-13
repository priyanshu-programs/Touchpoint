"use client";

import { useActionState } from "react";
import { TextareaField, TextField } from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";

// The name and description of a workflow. On a page it leads back to the list;
// in a dialog `onDone` closes it, after a save or on Cancel.
export function TemplateForm({
  action,
  initial,
  submitLabel,
  onDone,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: { name: string; description: string };
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next?.ok) onDone?.();
      return next;
    },
    null,
  );
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
      {onDone ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      ) : (
        <FormButtons
          state={state}
          pending={pending}
          submitLabel={submitLabel}
          cancelHref="/workflows"
        />
      )}
    </form>
  );
}
