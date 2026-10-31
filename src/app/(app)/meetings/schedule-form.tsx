"use client";

import { useActionState, useState } from "react";
import type { RecordFormState } from "@/app/(app)/form-state";
import { ButtonLink } from "@/components/button-link";
import { TextareaField, TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { RecordsPicker, type PickerOption } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { searchContactsAction } from "../people/contacts/actions";
import { scheduleMeetingAction } from "./actions";

function Box({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value="yes"
        defaultChecked={checked}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

export function ScheduleForm({
  initial,
  timezone,
  from,
  inside,
  cancelHref,
}: {
  initial: Record<string, string>;
  timezone: string;
  from?: "contact" | "organization";
  // The company whose panel this was opened in: its own, or the one a person is shown inside.
  inside?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(scheduleMeetingAction, null);
  // Which answer "Go back" was pressed on, so the next answer asks again.
  const [wentBackFrom, setWentBackFrom] = useState<RecordFormState>(null);
  const values = state?.values ?? initial;
  const confirming = Boolean(state?.confirm) && wentBackFrom !== state;

  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <FormOutcome state={state} />
        <ButtonLink href={cancelHref} variant="outline" className="justify-self-start">
          Back
        </ButtonLink>
      </div>
    );
  }

  return (
    // Remounting on new values is what makes the fields show them after a rejected press.
    <form
      key={state ? JSON.stringify(values) : "new"}
      action={formAction}
      className="grid gap-4"
    >
      {from && <input type="hidden" name="from" value={from} />}
      {inside && <input type="hidden" name="inside" value={inside} />}
      <input type="hidden" name="key" value={values.key} />

      {/* Kept in the form while confirming, so the second press sends the same values. */}
      <div hidden={confirming} className={confirming ? "hidden" : "grid gap-4"}>
        <TextField name="title" label="Title" defaultValue={values.title} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="startsAt"
            label="Starts"
            type="datetime-local"
            defaultValue={values.startsAt}
            required
          />
          <TextField
            name="endsAt"
            label="Ends"
            type="datetime-local"
            defaultValue={values.endsAt}
            required
          />
        </div>
        <RecordsPicker
          name="contacts"
          noun="contact"
          initial={JSON.parse(values.contacts) as PickerOption[]}
          search={searchContactsAction}
        />
        <TextField
          name="location"
          label="Location"
          hint="For a meeting in person. Leave empty for none."
          defaultValue={values.location}
        />
        <TextareaField
          name="notes"
          label="Notes for the invitation"
          hint="Goes to Google with the invitation. Touchpoint doesn't keep it."
          defaultValue={values.notes}
        />
        <div className="grid gap-2">
          <Box
            name="emailGuests"
            label="Email the invitation to guests"
            checked={values.emailGuests === "yes"}
          />
          <Box
            name="addMeet"
            label="Add a Google Meet link"
            checked={values.addMeet === "yes"}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Times are in your time zone, {timezone}.
        </p>
      </div>

      {confirming ? (
        <>
          <p role="status" className="rounded-lg border p-4 text-sm break-words">
            {state?.confirm}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="confirmed" value="yes" disabled={pending}>
              {pending ? "Scheduling…" : "Schedule"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setWentBackFrom(state)}
            >
              Go back
            </Button>
          </div>
        </>
      ) : (
        <>
          {state?.message && <FormOutcome state={state} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
            <ButtonLink href={cancelHref} variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </>
      )}
    </form>
  );
}
