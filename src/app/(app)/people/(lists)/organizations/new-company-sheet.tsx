"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createCompanyQuickAction } from "../../organizations/actions";

export function NewCompanySheet() {
  const [state, formAction, pending] = useActionState(
    createCompanyQuickAction,
    null,
  );
  const values = state?.values ?? { name: "", website: "" };

  return (
    <Sheet>
      <SheetTrigger render={<Button />}>
        <Plus aria-hidden />
        New company
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>New company</SheetTitle>
          <SheetDescription>
            Give it a name and a domain. The website is read for the logo,
            description, industry, location and contact details.
          </SheetDescription>
        </SheetHeader>
        <form
          key={JSON.stringify(values)}
          action={formAction}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
            <TextField
              name="name"
              label="Name"
              placeholder="Stripe"
              defaultValue={values.name}
              required
            />
            <TextField
              name="website"
              label="Domain"
              placeholder="stripe.com"
              hint="A full URL is fine — it is reduced to the bare host, which has to be unique."
              defaultValue={values.website}
            />
            <FormOutcome state={state} />
          </div>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add company"}
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
            <SheetClose render={<Button type="button" variant="outline" />}>
              Cancel
            </SheetClose>
            <Link
              href="/people/organizations/new"
              className="text-center text-sm text-muted-foreground underline"
            >
              More details
            </Link>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
