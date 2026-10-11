"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { Option } from "@/components/fields";
import { addContactEmailAction, addContactLinkAction } from "../actions";

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
