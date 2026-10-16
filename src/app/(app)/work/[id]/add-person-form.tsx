"use client";

import { useActionState, useState } from "react";
import type { RecordFormState } from "@/app/(app)/form-state";
import { FormMessage } from "@/components/form-message";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchContactsAction } from "../../people/contacts/actions";
import { addEngagementContactAction } from "../actions";

export function AddPersonForm({ engagementId }: { engagementId: string }) {
  // Counts the people added, so the picker starts empty again after each.
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const next = await addEngagementContactAction(
        engagementId,
        previous,
        formData,
      );
      if (next?.ok) setAdded((count) => count + 1);
      return next;
    },
    null,
  );

  return (
    <form action={action} aria-label="Add a person" className="grid gap-2">
      {/* It sits in the workspace's narrow column, so its parts stack. */}
      <div className="grid gap-2">
        <RecordPicker
          key={added}
          name="contactId"
          labelName="contactName"
          noun="person"
          plural="people"
          initial={null}
          search={searchContactsAction}
        />
        <Input
          name="role"
          aria-label="Role on the engagement"
          placeholder="Role (optional)"
          maxLength={100}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="justify-self-start"
        >
          Add person
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
