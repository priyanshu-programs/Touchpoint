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
import { searchOrganizationsAction } from "../people/organizations/actions";

export function EngagementForm({
  action,
  initial,
  statuses,
  currencies,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  statuses: Option[];
  currencies: string[];
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
      <div className="grid gap-4 sm:grid-cols-2">
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
        <SelectField
          name="status"
          label="Status"
          options={statuses}
          defaultValue={values.status}
        />
      </div>
      <TextField
        name="title"
        label="Title"
        placeholder="Website redesign"
        defaultValue={values.title}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="startDate"
          label="Start date"
          type="date"
          defaultValue={values.startDate}
        />
        <TextField
          name="targetEndDate"
          label="Target end date"
          type="date"
          defaultValue={values.targetEndDate}
        />
        <TextField
          name="value"
          label="Value"
          inputMode="decimal"
          placeholder="150000"
          hint="What the whole engagement is worth. Leave empty if not agreed yet."
          defaultValue={values.value}
        />
        <SelectField
          name="currency"
          label="Currency"
          options={currencies.map((code) => ({ value: code, label: code }))}
          defaultValue={values.currency}
        />
      </div>
      <TextField
        name="paymentTerms"
        label="Payment terms"
        placeholder="50% upfront, the rest on launch"
        defaultValue={values.paymentTerms}
      />
      <TextareaField
        name="scope"
        label="Scope"
        hint="What is included, and what is not."
        defaultValue={values.scope}
      />
      <TextareaField
        name="objectives"
        label="Objectives"
        hint="What the client wants to have when it is done."
        defaultValue={values.objectives}
      />

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
