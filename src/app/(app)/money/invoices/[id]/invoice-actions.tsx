"use client";

import { Ban, MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InvoiceStatus } from "@/db/schema";
import { deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction } from "../actions";

const CONFIRMS = {
  void: {
    title: "Void this invoice?",
    description:
      "A void invoice stays on record, marked void, and no longer counts as billed. It cannot be edited or issued again afterwards.",
    label: "Void invoice",
    action: voidInvoiceAction,
  },
  delete: {
    title: "Delete this draft?",
    description: "The draft, its lines and its file are removed for good.",
    label: "Delete draft",
    action: deleteInvoiceAction,
  },
  deleteIssued: {
    title: "Delete this invoice?",
    description:
      "The invoice, its lines and its file are removed for good. Its company or person can then be deleted if nothing else bills them.",
    label: "Delete invoice",
    action: deleteInvoiceAction,
  },
  deleteVoid: {
    title: "Delete this void invoice?",
    description:
      "The invoice, its lines and its file are removed for good. Its company or person can then be deleted if nothing else bills them.",
    label: "Delete invoice",
    action: deleteInvoiceAction,
  },
  deletePaid: {
    title: "Delete this invoice?",
    description:
      "The invoice, its lines and its file are removed for good. Choose what happens to the payments put towards it.",
    label: "Delete invoice",
    action: deleteInvoiceAction,
  },
};

const PAYMENT_CHOICES = [
  {
    value: "keep",
    label: "Keep the payments",
    hint: "They stay under Payments, and what they put towards this invoice becomes unallocated, ready for another invoice.",
  },
  {
    value: "delete",
    label: "Delete the payments too",
    hint: "Each payment is removed. Any other invoice it paid owes that amount again.",
  },
];

// Any invoice can be deleted. A draft is also edited and issued, an issued one edited
// and voided, and one with payments is otherwise left as it is.
export function InvoiceActions({
  id,
  number,
  status,
  payments,
  editHref,
}: {
  id: string;
  number: string;
  status: InvoiceStatus;
  payments: number;
  editHref: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<keyof typeof CONFIRMS | null>(null);
  const confirm = confirming ? CONFIRMS[confirming] : null;
  const paid = payments > 0;

  function issue() {
    const formData = new FormData();
    formData.set("id", id);
    void issueInvoiceAction(formData);
  }

  const deleteConfirm = paid
    ? "deletePaid"
    : status === "draft"
      ? "delete"
      : status === "void"
        ? "deleteVoid"
        : "deleteIssued";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${number}`}
          render={<Button variant="outline" size="icon" className="size-7" />}
        >
          <MoreVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          {status !== "void" && !paid && (
            <>
              <DropdownMenuItem onClick={() => router.push(editHref)}>
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
              {status === "draft" && (
                <DropdownMenuItem onClick={issue}>
                  <Send aria-hidden />
                  Mark as issued
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {status === "issued" && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirming("void")}>
                  <Ban aria-hidden />
                  Void
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(deleteConfirm)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirm && (
            <form
              id="invoice-confirm"
              action={confirm.action}
              onSubmit={() => setConfirming(null)}
              className="contents"
            >
              <input type="hidden" name="id" value={id} />
              {confirming === "deletePaid" && (
                <fieldset className="grid gap-2">
                  <legend className="sr-only">
                    {payments === 1 ? "Its payment" : `Its ${payments} payments`}
                  </legend>
                  {PAYMENT_CHOICES.map((choice) => (
                    <label
                      key={choice.value}
                      className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring"
                    >
                      <input
                        type="radio"
                        name="payments"
                        value={choice.value}
                        defaultChecked={choice.value === "keep"}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium">{choice.label}</span>
                        <span className="text-muted-foreground">{choice.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </form>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirm && (
              <AlertDialogAction
                type="submit"
                form="invoice-confirm"
                variant="destructive"
                className="w-full sm:w-auto"
              >
                {confirm.label}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
