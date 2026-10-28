import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { paymentAllocations, payments } from "@/db/schema";
import { audit } from "@/modules/audit/service";

// What the audit log keeps of a payment.
export async function paymentSnapshot(tx: Tx, row: typeof payments.$inferSelect) {
  const allocations = await tx
    .select({ invoiceId: paymentAllocations.invoiceId, amountMinor: paymentAllocations.amountMinor })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, row.id))
    .orderBy(asc(paymentAllocations.invoiceId));
  return {
    organizationId: row.organizationId,
    contactId: row.contactId,
    receivedOn: row.receivedOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    fxRateToBase: row.fxRateToBase,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    allocations,
  };
}

// A locked payment goes with what it put towards each invoice, which then owe that again.
export async function removePayment(
  tx: Tx,
  ownerId: string,
  payment: typeof payments.$inferSelect,
) {
  const before = await paymentSnapshot(tx, payment);
  await tx.delete(payments).where(eq(payments.id, payment.id));
  await audit(tx, {
    ownerId,
    actor: "user",
    action: "payment.delete",
    entityType: "payment",
    entityId: payment.id,
    before,
  });
}
