"use client";

import { useActionState } from "react";
import { SelectField, TextField, type Option } from "@/components/fields";
import { RecordPicker } from "@/components/record-picker";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import type { RecordFormState } from "@/app/(app)/form-state";
import { searchOrganizationsAction } from "../organizations/actions";

export function ContactForm({
  action,
  initial,
  options,
  withEmail,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
  initial: Record<string, string>;
  options: {
    statuses: Option[];
    relationshipTypes: Option[];
    channels: Option[];
    timezones: Option[];
  };
  withEmail: boolean;
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
          name="firstName"
          label="First name"
          defaultValue={values.firstName}
          required
        />
        <TextField
          name="lastName"
          label="Last name"
          defaultValue={values.lastName}
        />
        {withEmail && (
          <TextField
            name="email"
            label="Email"
            type="email"
            defaultValue={values.email}
          />
        )}
        <TextField
          name="phoneE164"
          label="Phone"
          type="tel"
          placeholder="+919876543210"
          defaultValue={values.phoneE164}
        />
        <RecordPicker
          name="organizationId"
          labelName="organizationName"
          noun="organization"
          initial={
            values.organizationId
              ? { id: values.organizationId, label: values.organizationName }
              : null
          }
          search={searchOrganizationsAction}
        />
        <TextField
          name="jobTitle"
          label="Job title"
          defaultValue={values.jobTitle}
        />
        <TextField
          name="department"
          label="Department"
          defaultValue={values.department}
        />
        <SelectField
          name="relationshipType"
          label="Relationship"
          options={options.relationshipTypes}
          defaultValue={values.relationshipType}
        />
        <SelectField
          name="status"
          label="Status"
          options={options.statuses}
          defaultValue={values.status}
        />
        <SelectField
          name="preferredChannel"
          label="Preferred channel"
          options={options.channels}
          blank="Not set"
          defaultValue={values.preferredChannel}
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
        <SelectField
          name="timezone"
          label="Time zone"
          options={options.timezones}
          blank="Not set"
          defaultValue={values.timezone}
        />
      </div>
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
