"use client";

import { useActionState, useState } from "react";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import type { OpenInvoice } from "@/modules/payments/queries";
import { allocatePaymentAction } from "../actions";
import { AllocationFields } from "../payment-form";

// What a payment did not cover, put towards the same client's open invoices.
export function AllocateForm({
  paymentId,
  invoices,
  unallocated,
  currency,
}: {
  paymentId: string;
  invoices: OpenInvoice[];
  unallocated: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(allocatePaymentAction, null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="paymentId" value={paymentId} />
      <AllocationFields
        invoices={invoices}
        amounts={amounts}
        onChange={setAmounts}
        available={unallocated}
        currency={currency}
      />
      <FormOutcome state={state?.ok ? null : state} />
      {invoices.length > 0 && (
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Put towards these invoices"}
        </Button>
      )}
    </form>
  );
}
