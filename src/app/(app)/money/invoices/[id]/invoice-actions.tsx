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
  deleteVoid: {
    title: "Delete this void invoice?",
    description:
      "The invoice, its lines and its file are removed for good. Its company or person can then be deleted if nothing else bills them.",
    label: "Delete invoice",
    action: deleteInvoiceAction,
  },
};

// What can be done to an invoice depends on where it stands: a draft is issued or
// deleted, an issued invoice voided (never deleted outright), and a void one deleted.
export function InvoiceActions({
  id,
  number,
  status,
  editHref,
}: {
  id: string;
  number: string;
  status: InvoiceStatus;
  editHref: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<keyof typeof CONFIRMS | null>(null);
  const confirm = confirming ? CONFIRMS[confirming] : null;

  function issue() {
    const formData = new FormData();
    formData.set("id", id);
    void issueInvoiceAction(formData);
  }

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
          {status !== "void" && (
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
            </>
          )}
          {status === "issued" ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming("void")}>
              <Ban aria-hidden />
              Void
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirming(status === "void" ? "deleteVoid" : "delete")}
            >
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirm && (
              <form action={confirm.action} onSubmit={() => setConfirming(null)}>
                <input type="hidden" name="id" value={id} />
                <AlertDialogAction type="submit" variant="destructive" className="w-full">
                  {confirm.label}
                </AlertDialogAction>
              </form>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
