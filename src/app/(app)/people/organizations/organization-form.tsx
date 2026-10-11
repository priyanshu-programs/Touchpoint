"use client";

import { useActionState } from "react";
import {
  SelectField,
  TextareaField,
  TextField,
  type Option,
} from "@/components/fields";
import { FormButtons, FormOutcome } from "../form-outcome";
import type { PeopleFormState } from "../form-state";

export function OrganizationForm({
  action,
  initial,
  statuses,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: PeopleFormState,
    formData: FormData,
  ) => Promise<PeopleFormState>;
  initial: Record<string, string>;
  statuses: Option[];
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
