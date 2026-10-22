"use client";

import { useActionState, useState } from "react";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { FormButtons, FormOutcome } from "@/components/form-outcome";
import {
  RecordPicker,
  RecordsPicker,
  type PickerOption,
} from "@/components/record-picker";
import type { Sendable } from "@/modules/materials/queries";
import { searchContactsAction } from "../people/contacts/actions";
import { searchOrganizationsAction } from "../people/organizations/actions";
import { sendChannelOptions } from "./labels";
import { logSendAction } from "./send-actions";

// Logs that a version of a material went to people, from the Activity tab of a
// company or a person.
export function SendForm({
  initial,
  sendable,
  timezone,
  from,
  inside,
  cancelHref,
}: {
  initial: Record<string, string>;
  sendable: Sendable;
  timezone: string;
  from?: "contact" | "organization";
  inside?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(logSendAction, null);
  const values = state?.values ?? initial;

  return (
    // Remounting on new values is what makes selects show them after a rejected submit.
    <form key={JSON.stringify(values)} action={formAction} className="grid gap-4">
      {from && <input type="hidden" name="from" value={from} />}
      {inside && <input type="hidden" name="inside" value={inside} />}
      {sendable.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No material has a version yet. Add one under Materials first.
        </p>
      ) : (
        <MaterialAndVersion
          sendable={sendable}
          materialId={values.materialId}
          versionId={values.versionId}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="sentAt"
          label="When"
          type="datetime-local"
          defaultValue={values.sentAt}
          required
        />
        <SelectField
          name="channel"
          label="How"
          options={sendChannelOptions}
          defaultValue={values.channel}
        />
      </div>
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
      <TextareaField name="note" label="Note" maxLength={2000} defaultValue={values.note} />
      <p className="text-sm text-muted-foreground">
        Dates and times are in your time zone, {timezone}. Sending a newer version to
        someone marks the older one they had as superseded.
      </p>

      <FormOutcome state={state} />
      <FormButtons
        state={state}
        pending={pending}
        submitLabel="Log send"
        cancelHref={cancelHref}
      />
    </form>
  );
}

// The versions offered are the chosen material's, its current one first.
function MaterialAndVersion({
  sendable,
  materialId,
  versionId,
}: {
  sendable: Sendable;
  materialId: string;
  versionId: string;
}) {
  const [chosen, setChosen] = useState(
    sendable.find(({ id }) => id === materialId)?.id ?? sendable[0].id,
  );
  const material = sendable.find(({ id }) => id === chosen) ?? sendable[0];

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
      <SelectField
        name="materialId"
        label="Material"
        options={sendable.map(({ id, name }) => ({ value: id, label: name }))}
        value={material.id}
        onChange={(event) => setChosen(event.currentTarget.value)}
      />
      <SelectField
        key={material.id}
        name="versionId"
        label="Version"
        options={material.versions.map(({ id, label }, index) => ({
          value: id,
          label: index === 0 ? `${label} (current)` : label,
        }))}
        defaultValue={
          material.versions.some(({ id }) => id === versionId)
            ? versionId
            : material.versions[0].id
        }
      />
    </div>
  );
}
