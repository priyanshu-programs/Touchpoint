"use client";

import { Plus, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { TextField } from "@/components/fields";
import { FormMessage } from "@/components/form-message";
import { FormOutcome } from "@/components/form-outcome";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";
import { searchContactsAction } from "../../contacts/actions";

type Action = (
  state: RecordFormState,
  formData: FormData,
) => Promise<RecordFormState>;

const BLANK = {
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phoneE164: "",
};

// Two ways to put someone at a company: as a new person, or as one already among the contacts.
export function AddContactForm({
  action,
  linkAction,
}: {
  action: Action;
  // Puts an existing contact at this company.
  linkAction: Action;
}) {
  const [open, setOpen] = useState<"new" | "existing" | null>(null);
  const [state, formAction, pending] = useActionState(action, null);
  // Counts the people linked, so the picker starts empty again after each.
  const [linkedCount, setLinkedCount] = useState(0);
  const [linked, linkFormAction, linking] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const next = await linkAction(previous, formData);
      if (next?.ok) setLinkedCount((count) => count + 1);
      return next;
    },
    null,
  );
  const values = state?.values ?? BLANK;

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen("new")}
        >
          <Plus aria-hidden />
          Add contact
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen("existing")}
        >
          <UserPlus aria-hidden />
          Add existing person
        </Button>
      </div>
    );
  }

  if (open === "existing") {
    return (
      <form
        action={linkFormAction}
        aria-label="Add existing person"
        className="grid gap-4 border-t pt-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordPicker
            key={linkedCount}
            name="contactId"
            labelName="contactName"
            noun="person"
            plural="people"
            initial={null}
            search={searchContactsAction}
          />
          <TextField name="jobTitle" label="Title at this company" />
        </div>
        <FormMessage state={linked} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={linking}>
            {linking ? "Saving…" : "Add to this company"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
            Done
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      key={JSON.stringify(values)}
      action={formAction}
      aria-label="Add contact"
      className="grid gap-4 border-t pt-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="firstName"
          label="First name"
          defaultValue={values.firstName}
          required
          autoFocus
        />
        <TextField
          name="lastName"
          label="Last name"
          defaultValue={values.lastName}
        />
        <TextField
          name="jobTitle"
          label="Job title"
          defaultValue={values.jobTitle}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          defaultValue={values.email}
        />
        <TextField
          name="phoneE164"
          label="Phone"
          type="tel"
          placeholder="+919876543210"
          defaultValue={values.phoneE164}
        />
      </div>

      <FormOutcome state={state} />
      <FormMessage state={linked} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || linking}>
          {pending ? "Saving…" : "Add contact"}
        </Button>
        {/* After the main button, so pressing Enter in a field never confirms a duplicate.
            The same person as an existing contact is put here under the title typed above. */}
        {state?.people?.map((person) => (
          <Button
            key={person.id}
            type="submit"
            formAction={linkFormAction}
            name="contactId"
            value={person.id}
            variant="outline"
            disabled={pending || linking}
          >
            Add {person.name} to this company
          </Button>
        ))}
        {state?.canConfirm && (
          <Button
            type="submit"
            name="confirmSimilar"
            value="yes"
            variant="outline"
            disabled={pending || linking}
          >
            Create anyway
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
          Done
        </Button>
      </div>
    </form>
  );
}
