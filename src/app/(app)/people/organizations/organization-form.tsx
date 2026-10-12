"use client";

import { useActionState } from "react";
import {
  SelectField,
  TextareaField,
  TextField,
  type Option,
} from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import type { RecordFormState } from "@/app/(app)/form-state";
import {
  CustomFieldInputs,
  type CustomFormField,
} from "../fields/custom-inputs";

export function OrganizationForm({
  action,
  initial,
  statuses,
  customFields = [],
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  statuses: Option[];
  // The owner's own fields, filled in once the company exists.
  customFields?: CustomFormField[];
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
        <TextField
          name="name"
          label="Name"
          defaultValue={values.name}
          required
        />
        <SelectField
          name="status"
          label="Status"
          options={statuses}
          defaultValue={values.status}
        />
        <TextField
          name="domain"
          label="Domain"
          placeholder="example.com"
          hint="Used to spot duplicates."
          defaultValue={values.domain}
        />
        <TextField
          name="website"
          label="Website"
          type="url"
          placeholder="https://example.com"
          defaultValue={values.website}
        />
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          defaultValue={values.phone}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          defaultValue={values.email}
        />
        <TextField
          name="industry"
          label="Industry"
          defaultValue={values.industry}
        />
        <TextField name="city" label="City" defaultValue={values.city} />
        <TextField
          name="region"
          label="State or region"
          defaultValue={values.region}
        />
        <TextField
          name="country"
          label="Country"
          defaultValue={values.country}
        />
      </div>
      <TextareaField
        name="description"
        label="Description"
        defaultValue={values.description}
      />
      <TextField
        name="tags"
        label="Tags"
        hint="Separate tags with commas."
        defaultValue={values.tags}
      />
      <CustomFieldInputs fields={customFields} values={values} />

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
