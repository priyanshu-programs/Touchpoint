"use client";

import { Merge } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { FormMessage } from "@/components/form-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SECTION_HEADING } from "@/components/detail-rows";
import type { MergeSide } from "@/modules/contacts/merge-fields";
import { mergeContactsAction } from "../contacts/actions";

export type MergeRow = {
  name: string;
  label: string;
  keep: ReactNode;
  other: ReactNode;
  side: MergeSide;
};

type Person = { id: string; name: string };

const FORM_ID = "merge-form";

export function MergeForm({
  keep,
  other,
  company,
  rows,
  brought,
}: {
  keep: Person;
  other: Person;
  company: string;
  rows: MergeRow[];
  brought: string[];
}) {
  const [state, formAction, pending] = useActionState(mergeContactsAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form id={FORM_ID} action={formAction} className="grid gap-6">
      <input type="hidden" name="keep" value={keep.id} />
      <input type="hidden" name="other" value={other.id} />
      <input type="hidden" name="company" value={company} />

      <section aria-labelledby="merge-choices" className="grid gap-3">
        <h3 id="merge-choices" className={SECTION_HEADING}>
          Where they differ
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Their details are the same, so there is nothing to choose.
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"
            >
              <span className="break-words">Keep: {keep.name}</span>
              <span className="break-words">Merge in: {other.name}</span>
            </div>
            {rows.map((row) => (
              <fieldset key={row.name} className="grid gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">{row.label}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["keep", "other"] as const).map((side) => (
                    <label
                      key={side}
                      className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring"
                    >
                      <input
                        type="radio"
                        name={row.name}
                        value={side}
                        defaultChecked={row.side === side}
                        aria-label={`${row.label} from ${side === "keep" ? keep.name : other.name}`}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="min-w-0 break-words">
                        {row[side] ?? (
                          <span className="text-muted-foreground">Empty</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </>
        )}
      </section>

      <section aria-labelledby="merge-brought" className="grid gap-2">
        <h3 id="merge-brought" className={SECTION_HEADING}>
          Brought over from {other.name}
        </h3>
        {brought.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing else.</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {brought.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-2">
        <FormMessage state={state} />
        <div>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            <Merge aria-hidden />
            Merge
          </Button>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Merge {other.name} into {keep.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {other.name} is deleted, and everything they had moves to{" "}
              {keep.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form={FORM_ID}
              variant="destructive"
              onClick={() => setConfirming(false)}
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
