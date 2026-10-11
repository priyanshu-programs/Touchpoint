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
import {
  RecordPicker,
  RecordsPicker,
  type PickerOption,
} from "@/components/record-picker";
import { searchContactsAction } from "../people/contacts/actions";
import { searchOrganizationsAction } from "../people/organizations/actions";

export function ActivityForm({
  action,
  initial,
  options,
  timezone,
  from,
  followUp = false,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  options: { kinds: Option[]; directions: Option[] };
  timezone: string;
  from?: "contact" | "organization";
  // Offered when logging, so the next step is decided while the conversation is fresh.
  followUp?: boolean;
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
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="kind"
          label="Type"
          options={options.kinds}
          defaultValue={values.kind}
        />
        <SelectField
          name="direction"
          label="Direction"
          options={options.directions}
          blank="Not applicable"
          defaultValue={values.direction}
        />
        <TextField
          name="occurredAt"
          label="When"
          type="datetime-local"
          defaultValue={values.occurredAt}
          required
        />
      </div>
      <TextField
        name="title"
        label="Summary"
        defaultValue={values.title}
        required
      />
      <TextareaField name="body" label="Notes" defaultValue={values.body} />
      <TextField
        name="outcome"
        label="Outcome"
        hint="What was agreed or decided, in a line."
        defaultValue={values.outcome}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <RecordsPicker
          name="contacts"
          noun="contact"
          initial={JSON.parse(values.contacts) as PickerOption[]}
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

      {followUp && (
        <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Follow-up</legend>
          <TextField
            name="followUpDate"
            label="Follow-up date"
            type="date"
            hint="Adds a task due that day. Leave empty for none."
            defaultValue={values.followUpDate}
          />
          <TextField
            name="followUpTitle"
            label="Follow-up task"
            hint="Leave empty to name it after the summary."
            defaultValue={values.followUpTitle}
          />
        </fieldset>
      )}
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
