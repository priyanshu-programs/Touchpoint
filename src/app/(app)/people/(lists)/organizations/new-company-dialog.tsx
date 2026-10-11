"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCompanyQuickAction } from "../../organizations/actions";

export function NewCompanyDialog() {
  const [state, formAction, pending] = useActionState(
    createCompanyQuickAction,
    null,
  );
  const values = state?.values ?? { name: "", website: "" };

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>New company</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
          <DialogDescription>
            A name is enough to start. The website is used to spot duplicates.
          </DialogDescription>
        </DialogHeader>
        <form
          key={JSON.stringify(values)}
          action={formAction}
          className="grid gap-4"
        >
          <TextField
            name="name"
            label="Name"
            defaultValue={values.name}
            required
          />
          <TextField
            name="website"
            label="Website"
            placeholder="example.com"
            defaultValue={values.website}
          />
          <FormOutcome state={state} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create company"}
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
            <Link
              href="/people/organizations/new"
              className="ml-auto text-sm underline"
            >
              More details
            </Link>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
