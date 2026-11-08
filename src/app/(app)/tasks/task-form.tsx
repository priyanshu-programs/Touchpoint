"use client";

import { useActionState, useCallback } from "react";
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
import type { PriorityColors } from "@/modules/settings/priority-colors";
import { PriorityColorSwatches } from "./priority-colors";

const Skull = () => <span aria-hidden>💀 </span>;

export function TaskForm({
  action,
  initial,
  options,
  colors,
  timezone,
  from,
  inside,
  back,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  options: { priorities: Option[]; repeats: Option[] };
  colors: PriorityColors;
  timezone: string;
  from?: "contact" | "organization";
  // The company whose panel the person was opened in, to go back there afterwards.
  inside?: string;
  // Started from a day on the calendar, so a new task goes back to that day.
  back?: "calendar";
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? initial;
  // From a company's own panel the company is that one, and only its people are offered.
  const company = from === "organization" ? initial.organizationId : undefined;
  const searchContacts = useCallback(
    (query: string) => searchContactsAction(query, company),
    [company],
  );

  return (
    // Remounting on new values is what makes selects show them after a rejected submit.
    <form
      key={JSON.stringify(values)}
      action={formAction}
      className="grid gap-4"
    >
      {from && <input type="hidden" name="from" value={from} />}
      {inside && <input type="hidden" name="inside" value={inside} />}
      {back && <input type="hidden" name="back" value={back} />}
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
          label={
            <>
              <Skull />
              Deadline date
            </>
          }
          type="date"
          defaultValue={values.dueDate}
        />
        <TextField
          name="dueTime"
          label={
            <>
              <Skull />
              Deadline time
            </>
          }
          type="time"
          hint="Leave empty for an all-day task."
          defaultValue={values.dueTime}
        />
        <div className="grid content-start gap-2">
          <SelectField
            name="priority"
            label="Priority"
            options={options.priorities}
            defaultValue={values.priority}
          />
          <PriorityColorSwatches colors={colors} />
        </div>
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
          search={searchContacts}
          empty={
            company ? `Nobody at ${initial.organizationName} matches.` : undefined
          }
        />
        {company ? (
          <>
            <input type="hidden" name="organizationId" value={company} />
            <input
              type="hidden"
              name="organizationName"
              value={initial.organizationName}
            />
          </>
        ) : (
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
        )}
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
