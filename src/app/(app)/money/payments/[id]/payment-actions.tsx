"use client";

import { MoreVertical, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePaymentAction } from "../actions";

// A payment recorded by mistake is deleted, after a confirmation.
export function PaymentActions({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${label}`}
          render={<Button variant="outline" size="icon" className="size-7" />}
        >
          <MoreVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              The payment is removed for good, and the invoices it paid owe that amount again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deletePaymentAction} onSubmit={() => setConfirming(false)}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Delete payment
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
