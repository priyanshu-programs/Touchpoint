"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields } from "@/lib/form";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { clientField } from "@/modules/invoices/schema";
import { getPayment, openInvoices } from "@/modules/payments/queries";
import { allocateInput, paymentInput, readAllocations } from "@/modules/payments/schema";
import { allocatePayment, deletePayment, recordPayment } from "@/modules/payments/service";
import { CURRENCIES } from "@/modules/settings/schema";
import { invoiceHref } from "../invoices/labels";
import { PAYMENT_REFUSALS, paymentHref } from "./labels";

const FIELDS = [
  "client",
  "receivedOn",
  "amount",
  "currency",
  "rate",
  "method",
  "reference",
  "notes",
  "idempotencyKey",
  "allocations",
] as const;

function refresh() {
  revalidatePath("/money", "layout");
  // A company's and a person's Invoices tab, and whether they can be deleted.
  revalidatePath("/people", "layout");
}

export async function recordPaymentAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const fields = readFields(formData, FIELDS);
  // The client's name is only echoed back, so a refused form shows the choice again.
  const values = { ...fields, ...readFields(formData, ["clientName"]) };
  const parsed = paymentInput.safeParse({
    ...fields,
    confirmDuplicate: formData.get("confirmDuplicate") === "yes" ? "yes" : "",
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await recordPayment(owner.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    if (result.reason === "duplicate") {
      const { existing } = result;
      return {
        ok: false,
        message: `This looks like a payment you have already recorded: ${formatMoney(existing.amountMinor, existing.currency)} from ${values.clientName || "this client"} on ${formatDate(existing.receivedOn)}, with the same reference. Record it anyway?`,
        values,
        links: [{ href: paymentHref(existing.id), label: "Open the payment already recorded" }],
        canConfirm: true,
      };
    }
    return { ok: false, message: PAYMENT_REFUSALS[result.reason], values };
  }

  refresh();
  // Recorded from an invoice it went towards, it goes back there to show the balance.
  const from = z.uuid().safeParse(formData.get("invoice"));
  const back =
    from.success && parsed.data.allocations.some(({ invoiceId }) => invoiceId === from.data);
  redirect(back ? invoiceHref(from.data!) : paymentHref(result.id));
}

// What a payment from this client in this currency can be put towards.
export async function openInvoicesAction(client: string, currency: string) {
  const owner = await requireOwner();
  const named = clientField("").safeParse(client);
  if (!named.success || !CURRENCIES.includes(currency)) return [];
  const { organizationId, contactId } = named.data;
  return openInvoices(
    owner.id,
    organizationId ? { organizationId } : { contactId: contactId! },
    currency,
  );
}

export async function allocatePaymentAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["allocations"]);
  const parsed = allocateInput.safeParse({
    paymentId: formData.get("paymentId"),
    allocations: values.allocations,
  });
  if (!parsed.success) return invalid(parsed.error, values);
  const payment = await getPayment(owner.id, parsed.data.paymentId);
  if (!payment) notFound();
  const read = readAllocations(parsed.data.allocations, payment.currency);
  if ("message" in read) return { ok: false, message: read.message, values };
  if (read.allocations.length === 0) {
    return { ok: false, message: "Enter an amount for at least one invoice.", values };
  }

  const result = await allocatePayment(owner.id, payment.id, read.allocations);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { ok: false, message: PAYMENT_REFUSALS[result.reason], values };
  }
  refresh();
  return { ok: true, message: "Put towards the invoices." };
}

export async function deletePaymentAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await deletePayment(owner.id, id))) notFound();
  refresh();
  redirect("/money/payments");
}
