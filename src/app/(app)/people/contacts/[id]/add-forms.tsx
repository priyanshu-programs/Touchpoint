"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { Option } from "@/components/fields";
import type { RecordFormState } from "@/app/(app)/form-state";
import { searchOrganizationsAction } from "../../organizations/actions";
import {
  addContactCompanyAction,
  addContactEmailAction,
  addContactLinkAction,
} from "../actions";

export function AddCompanyForm({ contactId }: { contactId: string }) {
  // Counts the companies added, so the picker starts empty again after each.
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const next = await addContactCompanyAction(contactId, previous, formData);
      if (next?.ok) setAdded((count) => count + 1);
      return next;
    },
    null,
  );
  return (
    <form action={action} aria-label="Add to a company" className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <RecordPicker
          key={added}
          name="organizationId"
          labelName="organizationName"
          noun="company"
          plural="companies"
          initial={null}
          search={searchOrganizationsAction}
        />
        <Input
          name="jobTitle"
          aria-label="Title at the company"
          placeholder="Title there (optional)"
          maxLength={150}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add company
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddEmailForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(
    addContactEmailAction.bind(null, contactId),
    null,
  );
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          name="email"
          type="email"
          aria-label="New email"
          placeholder="name@example.com"
          required
          className="w-full sm:w-64"
        />
        <Input
          name="label"
          aria-label="Email label"
          placeholder="Label, such as work"
          className="w-full sm:w-44"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add email
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddLinkForm({
  contactId,
  kinds,
}: {
  contactId: string;
  kinds: Option[];
}) {
  const [state, action, pending] = useActionState(
    addContactLinkAction.bind(null, contactId),
    null,
  );
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <NativeSelect name="kind" aria-label="Link type">
          {kinds.map((kind) => (
            <NativeSelectOption key={kind.value} value={kind.value}>
              {kind.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          name="url"
          type="url"
          aria-label="New link"
          placeholder="https://"
          required
          className="w-full sm:w-72"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add link
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
