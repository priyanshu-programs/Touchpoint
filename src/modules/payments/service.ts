import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { invoices, paymentAllocations, payments, settings } from "@/db/schema";
import { dateIn } from "@/lib/time";
import { audit } from "@/modules/audit/service";
import { invoiceBalance } from "@/modules/invoices/queries";
import { clientIsOwners } from "@/modules/invoices/service";
import { MAX_PAYMENTS, type Allocation, type PaymentInput } from "./schema";

type Refusal =
  | "not_found"
  | "limit"
  | "unknown_client"
  | "future"
  | "no_rate"
  | "invoice"
  | "over_balance"
  | "over_amount";

export type PaymentResult =
  | { ok: true; id: string }
  | { ok: false; reason: Refusal }
  | {
      ok: false;
      reason: "duplicate";
      existing: { id: string; receivedOn: string; amountMinor: number; currency: string };
    };

// Held to the end of the transaction, so the limit and the idempotency key cannot be
// passed by two submits at once.
const lockPayments = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payments:${ownerId}`}))`);

type Client = { organizationId: string | null; contactId: string | null };

const sameClient = (client: Client) =>
  client.organizationId
    ? eq(invoices.organizationId, client.organizationId)
    : eq(invoices.contactId, client.contactId!);

// The invoices are locked before they are read, in one order so two payments cannot
// deadlock; an invoice edit or void locks the same row, so it waits for this to finish.
// Each must be the owner's, issued, the same client's and in the payment's currency,
// and none may be given more than it still owes. Their sum is checked against what
// the payment has left.
async function allocationRefusal(
  tx: Tx,
  ownerId: string,
  payment: Client & { currency: string; unallocated: number },
  allocations: Allocation[],
): Promise<Refusal | null> {
  if (allocations.length === 0) return null;
  const ids = allocations.map(({ invoiceId }) => invoiceId).sort();
  await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), inArray(invoices.id, ids)))
    .orderBy(asc(invoices.id))
    .for("update");
  const open = await tx
    .select({ id: invoices.id, balance: invoiceBalance })
    .from(invoices)
    .where(
      and(
        eq(invoices.ownerId, ownerId),
        inArray(invoices.id, ids),
        eq(invoices.status, "issued"),
        eq(invoices.currency, payment.currency),
        sameClient(payment),
      ),
    );
  if (open.length !== ids.length) return "invoice";
  const owing = new Map(open.map((row) => [row.id, row.balance]));
  if (allocations.some(({ invoiceId, amountMinor }) => amountMinor > owing.get(invoiceId)!)) {
    return "over_balance";
  }
  const total = allocations.reduce((sum, { amountMinor }) => sum + amountMinor, 0);
  return total > payment.unallocated ? "over_amount" : null;
}

// What the audit log keeps of a payment.
async function snapshot(tx: Tx, row: typeof payments.$inferSelect) {
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

export async function recordPayment(
  ownerId: string,
  input: PaymentInput,
): Promise<PaymentResult> {
  return db.transaction(async (tx) => {
    await lockPayments(tx, ownerId);
    // The same form sent twice: the first one stands.
    const [again] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.ownerId, ownerId), eq(payments.idempotencyKey, input.idempotencyKey)));
    if (again) return { ok: true, id: again.id };

    const owned = await tx.$count(payments, eq(payments.ownerId, ownerId));
    if (owned >= MAX_PAYMENTS) return { ok: false, reason: "limit" };
    const [setting] = await tx
      .select({ baseCurrency: settings.baseCurrency, timezone: settings.timezone })
      .from(settings)
      .where(eq(settings.ownerId, ownerId));
    if (input.receivedOn > dateIn(setting?.timezone ?? "UTC")) {
      return { ok: false, reason: "future" };
    }
    // A rate is kept only for a currency other than the base one, and needed for it.
    const base = input.currency === (setting?.baseCurrency ?? "INR");
    if (!base && input.fxRateToBase === null) return { ok: false, reason: "no_rate" };
    if (!(await clientIsOwners(tx, ownerId, input))) {
      return { ok: false, reason: "unknown_client" };
    }

    if (!input.confirmDuplicate) {
      const [existing] = await tx
        .select({
          id: payments.id,
          receivedOn: payments.receivedOn,
          amountMinor: payments.amountMinor,
          currency: payments.currency,
        })
        .from(payments)
        .where(
          and(
            eq(payments.ownerId, ownerId),
            input.organizationId
              ? eq(payments.organizationId, input.organizationId)
              : eq(payments.contactId, input.contactId!),
            eq(payments.amountMinor, input.amountMinor),
            eq(payments.currency, input.currency),
            eq(payments.receivedOn, input.receivedOn),
            input.reference === null
              ? isNull(payments.reference)
              : sql`lower(${payments.reference}) = lower(${input.reference})`,
          ),
        )
        .limit(1);
      if (existing) return { ok: false, reason: "duplicate", existing };
    }

    const refusal = await allocationRefusal(
      tx,
      ownerId,
      { ...input, unallocated: input.amountMinor },
      input.allocations,
    );
    if (refusal) return { ok: false, reason: refusal };

    const [row] = await tx
      .insert(payments)
      .values({
        ownerId,
        organizationId: input.organizationId,
        contactId: input.contactId,
        receivedOn: input.receivedOn,
        amountMinor: input.amountMinor,
        currency: input.currency,
        fxRateToBase: base ? null : input.fxRateToBase,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    if (input.allocations.length > 0) {
      await tx
        .insert(paymentAllocations)
        .values(input.allocations.map((allocation) => ({ ownerId, paymentId: row.id, ...allocation })));
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "payment.record",
      entityType: "payment",
      entityId: row.id,
      after: await snapshot(tx, row),
    });
    return { ok: true, id: row.id };
  });
}

async function lockPayment(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.ownerId, ownerId), eq(payments.id, id)))
    .for("update");
  return row;
}

// What a payment did not cover, put towards more of the same client's invoices. An
// invoice it already went to has the amount added.
export async function allocatePayment(
  ownerId: string,
  paymentId: string,
  allocations: Allocation[],
): Promise<{ ok: true } | { ok: false; reason: Refusal }> {
  return db.transaction(async (tx) => {
    const payment = await lockPayment(tx, ownerId, paymentId);
    if (!payment) return { ok: false, reason: "not_found" };
    const before = await snapshot(tx, payment);
    const allocated = before.allocations.reduce((sum, { amountMinor }) => sum + amountMinor, 0);
    const refusal = await allocationRefusal(
      tx,
      ownerId,
      { ...payment, unallocated: payment.amountMinor - allocated },
      allocations,
    );
    if (refusal) return { ok: false, reason: refusal };

    await tx
      .insert(paymentAllocations)
      .values(allocations.map((allocation) => ({ ownerId, paymentId, ...allocation })))
      .onConflictDoUpdate({
        target: [paymentAllocations.paymentId, paymentAllocations.invoiceId],
        set: {
          amountMinor: sql`${paymentAllocations.amountMinor} + excluded.amount_minor`,
        },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "payment.allocate",
      entityType: "payment",
      entityId: paymentId,
      before,
      after: await snapshot(tx, payment),
    });
    return { ok: true };
  });
}

// A payment recorded by mistake goes with what it put towards each invoice, which then
// owe that again and can be edited or voided once nothing else has paid them.
export async function deletePayment(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const payment = await lockPayment(tx, ownerId, id);
    if (!payment) return false;
    const before = await snapshot(tx, payment);
    await tx.delete(payments).where(eq(payments.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "payment.delete",
      entityType: "payment",
      entityId: id,
      before,
    });
    return true;
  });
}
