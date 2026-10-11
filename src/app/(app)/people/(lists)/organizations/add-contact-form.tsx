"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";

const BLANK = {
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phoneE164: "",
};

export function AddContactForm({
  action,
}: {
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? BLANK;

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden />
        Add contact
      </Button>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add contact"}
        </Button>
        {/* After the main button, so pressing Enter in a field never confirms a duplicate. */}
        {state?.canConfirm && (
          <Button
            type="submit"
            name="confirmSimilar"
            value="yes"
            variant="outline"
            disabled={pending}
          >
            Create anyway
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
