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
import { RecordPicker } from "@/components/record-picker";
import { searchContactsAction } from "../people/contacts/actions";
import { searchOrganizationsAction } from "../people/organizations/actions";

export function TaskForm({
  action,
  initial,
  options,
  timezone,
  from,
  inside,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  options: { priorities: Option[]; repeats: Option[] };
  timezone: string;
  from?: "contact" | "organization";
  // The company whose panel the person was opened in, to go back there afterwards.
  inside?: string;
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
      {from && <input type="hidden" name="from" value={from} />}
      {inside && <input type="hidden" name="inside" value={inside} />}
      <TextField
        name="title"
        label="Task"
        defaultValue={values.title}
        required
      />
      <TextareaField name="notes" label="Notes" defaultValue={values.notes} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="dueDate"
          label="Due date"
          type="date"
          defaultValue={values.dueDate}
        />
        <TextField
          name="dueTime"
          label="Due time"
          type="time"
          hint="Leave empty for an all-day task."
          defaultValue={values.dueTime}
        />
        <SelectField
          name="priority"
          label="Priority"
          options={options.priorities}
          defaultValue={values.priority}
        />
        <TextField
          name="remindAt"
          label="Reminder"
          type="datetime-local"
          hint="Shown on Today once the time has passed."
          defaultValue={values.remindAt}
        />
        <SelectField
          name="repeat"
          label="Repeats"
          options={options.repeats}
          blank="Does not repeat"
          defaultValue={values.repeat}
        />
        <TextField
          name="repeatEvery"
          label="Repeat every"
          type="number"
          min={1}
          max={99}
          hint="2 with Weekly means every two weeks."
          defaultValue={values.repeatEvery}
        />
        <RecordPicker
          name="contactId"
          labelName="contactName"
          noun="contact"
          initial={
            values.contactId
              ? { id: values.contactId, label: values.contactName }
              : null
          }
          search={searchContactsAction}
        />
        <RecordPicker
          name="organizationId"
          labelName="organizationName"
          noun="company"
          plural="companies"
          initial={
            values.organizationId
              ? { id: values.organizationId, label: values.organizationName }
              : null
          }
          search={searchOrganizationsAction}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Dates and times are in your time zone, {timezone}.
      </p>

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
