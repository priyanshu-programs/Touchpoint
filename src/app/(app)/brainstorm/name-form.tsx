"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RecordFormState } from "@/app/(app)/form-state";
import { createBrainstormAction } from "./actions";

// A board's name, for a new board and for renaming one. In a dialog `onDone`
// closes it, after a save or on Cancel; on a page Cancel leads back to the list.
export function NameForm({
  action,
  name,
  submitLabel,
  onDone,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>;
  name: string;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next?.ok) onDone?.();
      return next;
    },
    null,
  );

  return (
    <form
      key={state?.values?.name ?? name}
      action={formAction}
      className="grid gap-4"
    >
      <TextField
        name="name"
        label="Name"
        defaultValue={state?.values?.name ?? name}
        maxLength={100}
        required
      />
      <FormOutcome state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : (
          <ButtonLink href="/brainstorm" variant="ghost">
            Cancel
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function NewBrainstorm() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New board
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New brainstorm board</DialogTitle>
            <DialogDescription>
              A whiteboard of your own to think on. It opens as soon as it is made.
            </DialogDescription>
          </DialogHeader>
          <NameForm
            action={createBrainstormAction}
            name=""
            submitLabel="Create board"
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
