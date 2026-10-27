import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices, payments } from "@/db/schema";
import { convertToBase } from "@/lib/money";
import { invoiceBalance, invoiceTotal, stateIs } from "@/modules/invoices/queries";
import type { DateRange } from "./period";

export type Client = { organizationId: string } | { contactId: string };

export type CurrencyAmount = { currency: string; minor: number; count: number };

// The base currency first, then the rest in order.
const baseFirst = (base: string) => (a: { currency: string }, b: { currency: string }) =>
  a.currency === base ? -1 : b.currency === base ? 1 : a.currency.localeCompare(b.currency);

export const clientOf = (
  table: typeof invoices | typeof payments,
  client: Client | undefined,
): SQL | undefined =>
  !client
    ? undefined
    : "organizationId" in client
      ? eq(table.organizationId, client.organizationId)
      : eq(table.contactId, client.contactId);

export const within = (column: typeof invoices.issueDate | typeof payments.receivedOn, range: DateRange) =>
  and(range.from ? gte(column, range.from) : undefined, range.to ? lte(column, range.to) : undefined);

// Payments summed by currency and by whether they carry a rate, as `inBase` takes them;
// `product` is the sum of each amount times its rate, as exact text.
export const ratedColumns = {
  currency: payments.currency,
  rated: sql<boolean>`${payments.fxRateToBase} is not null`,
  count: sql<number>`count(*)::int`,
  minor: sql<number>`sum(${payments.amountMinor})::bigint`.mapWith(Number),
  product: sql<string | null>`sum(${payments.amountMinor} * ${payments.fxRateToBase})::text`,
};
export const ratedGroup = [payments.currency, sql`${payments.fxRateToBase} is not null`] as const;

export type RatedSum = {
  currency: string;
  rated: boolean;
  count: number;
  minor: number;
  product: string | null;
};

// Sums of payments in the base currency. A payment in another currency counts at the
// rate stored with it; one with no rate (recorded before the base currency was changed)
// is listed apart, not guessed.
export function inBase(rows: RatedSum[], base: string) {
  let minor = 0;
  let count = 0;
  const converted: CurrencyAmount[] = [];
  const unconverted: CurrencyAmount[] = [];
  for (const row of rows) {
    count += row.count;
    if (row.currency === base) {
      minor += row.minor;
    } else if (row.rated && row.product) {
      minor += convertToBase(row.product, row.currency, base);
      converted.push({ currency: row.currency, minor: row.minor, count: row.count });
    } else {
      unconverted.push({ currency: row.currency, minor: row.minor, count: row.count });
    }
  }
  return { minor, count, converted, unconverted };
}

export type BaseSum = ReturnType<typeof inBase>;

// Money that came in during the period, in the base currency.
async function received(ownerId: string, range: DateRange, client: Client | undefined, base: string) {
  const rows = await db
    .select(ratedColumns)
    .from(payments)
    .where(
      and(eq(payments.ownerId, ownerId), within(payments.receivedOn, range), clientOf(payments, client)),
    )
    .groupBy(...ratedGroup)
    .orderBy(asc(payments.currency));
  return inBase(rows, base);
}

// Issued invoices dated in the period, per currency; drafts and void ones are not counted.
async function invoiced(ownerId: string, range: DateRange, client: Client | undefined, today: string) {
  return db
    .select({
      currency: invoices.currency,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`coalesce(sum(${invoiceTotal}), 0)::bigint`.mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.ownerId, ownerId),
        stateIs("issued", today),
        within(invoices.issueDate, range),
        clientOf(invoices, client),
      ),
    )
    .groupBy(invoices.currency);
}

// What issued invoices still owe today, whenever they were issued, per currency, and
// how much of it is past due.
async function outstanding(ownerId: string, client: Client | undefined, today: string) {
  const overdue = stateIs("overdue", today);
  return db
    .select({
      currency: invoices.currency,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`coalesce(sum(${invoiceBalance}), 0)::bigint`.mapWith(Number),
      overdueCount: sql<number>`(count(*) filter (where ${overdue}))::int`,
      overdueMinor: sql<number>`coalesce(sum(${invoiceBalance}) filter (where ${overdue}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), stateIs("outstanding", today), clientOf(invoices, client)))
    .groupBy(invoices.currency);
}

// Received, Invoiced and Outstanding, each worked out from stored rows and each
// matching, row for row, the list its figure opens.
export async function revenueSummary(
  ownerId: string,
  options: { range: DateRange; client?: Client; today: string; baseCurrency: string },
) {
  const { range, client, today, baseCurrency } = options;
  const [money, billed, owed] = await Promise.all([
    received(ownerId, range, client, baseCurrency),
    invoiced(ownerId, range, client, today),
    outstanding(ownerId, client, today),
  ]);
  return {
    received: money,
    invoiced: billed.sort(baseFirst(baseCurrency)),
    outstanding: owed.sort(baseFirst(baseCurrency)),
  };
}

export type RevenueSummary = Awaited<ReturnType<typeof revenueSummary>>;

// Whether the owner has recorded any invoice or payment, which Today waits for
// before it shows money.
export async function hasMoney(ownerId: string) {
  const result = await db.execute<{ any: boolean }>(sql`
    select exists (select 1 from ${invoices} where ${invoices.ownerId} = ${ownerId})
        or exists (select 1 from ${payments} where ${payments.ownerId} = ${ownerId}) as any
  `);
  return result.rows[0].any;
}
