import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, invoices, organizations, paymentAllocations, payments } from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { invoiceBalance, invoiceTotal } from "@/modules/invoices/queries";
import { logoVersion } from "@/modules/organizations/queries";
import type { PaymentSort } from "./schema";

const ownedBy = (ownerId: string) => eq(payments.ownerId, ownerId);

type Client = { organizationId: string } | { contactId: string };

const ofClient = (client: Client) =>
  "organizationId" in client
    ? eq(payments.organizationId, client.organizationId)
    : eq(payments.contactId, client.contactId);

// What a payment has put towards invoices; the rest of it is unallocated.
export const paymentAllocated = sql<number>`(
  select coalesce(sum(pa.amount_minor), 0) from payment_allocations pa where pa.payment_id = "payments"."id"
)::bigint`.mapWith(Number);

// Who paid, a company or a person, with the picture to show beside them.
export const clientColumns = {
  organizationId: payments.organizationId,
  contactId: payments.contactId,
  clientName: sql<string>`coalesce(${organizations.name}, ${contacts.fullName})`,
  logoVersion: sql<string | null>`case when ${payments.organizationId} is not null then ${logoVersion} end`,
  photoVersion: sql<string | null>`case when ${payments.contactId} is not null then ${photoVersion} end`,
};

const rowColumns = {
  id: payments.id,
  receivedOn: payments.receivedOn,
  amountMinor: payments.amountMinor,
  currency: payments.currency,
  method: payments.method,
  reference: payments.reference,
  allocated: paymentAllocated,
};

const SORT_BY: Record<PaymentSort, ReturnType<typeof sql>> = {
  received: sql`${payments.receivedOn}`,
  amount: sql`${payments.amountMinor}`,
};

const contains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export async function listPayments(
  ownerId: string,
  options: {
    q?: string;
    currency?: string;
    organizationId?: string;
    contactId?: string;
    // Received on or after, and on or before.
    from?: string;
    to?: string;
    sort?: PaymentSort;
    dir?: "asc" | "desc";
    offset?: number;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const q = options.q?.trim();
  const direction = options.dir === "asc" ? sql`asc` : sql`desc`;
  const matching = and(
    ownedBy(ownerId),
    options.currency ? eq(payments.currency, options.currency) : undefined,
    options.organizationId ? eq(payments.organizationId, options.organizationId) : undefined,
    options.contactId ? eq(payments.contactId, options.contactId) : undefined,
    options.from ? gte(payments.receivedOn, options.from) : undefined,
    options.to ? lte(payments.receivedOn, options.to) : undefined,
    q
      ? or(
          sql`${payments.reference} ilike ${contains(q)}`,
          sql`${organizations.name} ilike ${contains(q)}`,
          sql`${contacts.fullName} ilike ${contains(q)}`,
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...rowColumns, ...clientColumns })
      .from(payments)
      .leftJoin(organizations, eq(organizations.id, payments.organizationId))
      .leftJoin(contacts, eq(contacts.id, payments.contactId))
      .where(matching)
      // The latest first by default; the time it was recorded and id keep pages stable.
      .orderBy(
        sql`${SORT_BY[options.sort ?? "received"]} ${direction}`,
        desc(payments.createdAt),
        asc(payments.id),
      )
      .limit(limit + 1)
      .offset(options.offset ?? 0),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(payments)
      .leftJoin(organizations, eq(organizations.id, payments.organizationId))
      .leftJoin(contacts, eq(contacts.id, payments.contactId))
      .where(matching),
  ]);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, total };
}

// The currencies the owner has been paid in, for the list's filter.
export async function paymentCurrencies(ownerId: string) {
  const rows = await db
    .selectDistinct({ currency: payments.currency })
    .from(payments)
    .where(ownedBy(ownerId))
    .orderBy(asc(payments.currency));
  return rows.map(({ currency }) => currency);
}

// A payment with the invoices it went towards.
export async function getPayment(ownerId: string, id: string) {
  const [row] = await db
    .select({
      ...rowColumns,
      fxRateToBase: payments.fxRateToBase,
      notes: payments.notes,
      ...clientColumns,
    })
    .from(payments)
    .leftJoin(organizations, eq(organizations.id, payments.organizationId))
    .leftJoin(contacts, eq(contacts.id, payments.contactId))
    .where(and(ownedBy(ownerId), eq(payments.id, id)));
  if (!row) return null;

  const allocations = await db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      dueDate: invoices.dueDate,
      amountMinor: paymentAllocations.amountMinor,
    })
    .from(paymentAllocations)
    .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
    .where(and(eq(paymentAllocations.ownerId, ownerId), eq(paymentAllocations.paymentId, id)))
    .orderBy(asc(invoices.dueDate), asc(sql`lower(${invoices.number})`));

  return { ...row, allocations, unallocated: row.amountMinor - row.allocated };
}

export type Payment = NonNullable<Awaited<ReturnType<typeof getPayment>>>;

// The payments from one company or person, the latest first.
export async function paymentsOfRecord(ownerId: string, client: Client) {
  return db
    .select(rowColumns)
    .from(payments)
    .where(and(ownedBy(ownerId), ofClient(client)))
    .orderBy(desc(payments.receivedOn), desc(payments.createdAt), asc(payments.id))
    .limit(100);
}

// A client's issued invoices in one currency that still owe something, the one due
// first first: what a payment from them can be put towards.
export async function openInvoices(ownerId: string, client: Client, currency: string) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      dueDate: invoices.dueDate,
      total: invoiceTotal,
      balance: invoiceBalance,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.ownerId, ownerId),
        "organizationId" in client
          ? eq(invoices.organizationId, client.organizationId)
          : eq(invoices.contactId, client.contactId),
        eq(invoices.status, "issued"),
        eq(invoices.currency, currency),
        sql`${invoiceBalance} > 0`,
      ),
    )
    .orderBy(asc(invoices.dueDate), asc(sql`lower(${invoices.number})`))
    .limit(100);
}

export type OpenInvoice = Awaited<ReturnType<typeof openInvoices>>[number];
