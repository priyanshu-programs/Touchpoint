import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contacts,
  invoiceLines,
  invoices,
  organizations,
  paymentAllocations,
  payments,
} from "@/db/schema";
import { stateIs } from "@/modules/invoices/queries";
import { clientColumns, paymentAllocated } from "@/modules/payments/queries";
import type { DateRange } from "@/modules/revenue/period";
import {
  inBase,
  ratedColumns,
  ratedGroup,
  within,
  type BaseSum,
  type RatedSum,
} from "@/modules/revenue/queries";

const PAGE = 50;

const paidBy = (ownerId: string, range: DateRange) =>
  and(eq(payments.ownerId, ownerId), within(payments.receivedOn, range));

// Rows that carry a key besides their currency sums, each key's rows turned into the
// base currency together.
function byKey<K, R extends RatedSum>(rows: R[], key: (row: R) => K, base: string) {
  const groups = new Map<K, R[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups].map(([value, group]) => ({ key: value, first: group[0], sum: inBase(group, base) }));
}

const nextMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
};
const lastDay = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};
const later = (a: string, b?: string) => (b && b > a ? b : a);
const earlier = (a: string, b?: string) => (b && b < a ? b : a);

// Money received in each month of the range, in the base currency. The months run from
// the first payment in the range to the range's end or today, whichever is sooner, so
// "All time" or wide dates never list years with nothing in them; a month inside that
// with nothing received is shown as nothing.
export async function revenueByMonth(
  ownerId: string,
  range: DateRange,
  options: { today: string; baseCurrency: string },
) {
  const month = sql<string>`to_char(${payments.receivedOn}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, ...ratedColumns })
    .from(payments)
    .where(paidBy(ownerId, range))
    .groupBy(month, ...ratedGroup)
    .orderBy(asc(month));

  const total = inBase(rows, options.baseCurrency);
  if (rows.length === 0) return { total, months: [] };
  const sums = new Map(byKey(rows, (row) => row.month, options.baseCurrency).map((g) => [g.key, g.sum]));
  const last = earlier(options.today, range.to).slice(0, 7);
  const months: ({ month: string; from: string; to: string } & BaseSum)[] = [];
  for (let current = rows[0].month; current <= last; current = nextMonth(current)) {
    months.push({
      month: current,
      from: later(`${current}-01`, range.from),
      to: earlier(lastDay(current), range.to),
      ...(sums.get(current) ?? { minor: 0, count: 0, converted: [], unconverted: [] }),
    });
  }
  return { total, months };
}

export type ClientKey = { organizationId: string } | { contactId: string };

// Money received from each client in the range, in the base currency, most first.
export async function revenueByClient(
  ownerId: string,
  range: DateRange,
  options: { baseCurrency: string; limit?: number; offset?: number },
) {
  const rows = await db
    .select({
      organizationId: payments.organizationId,
      contactId: payments.contactId,
      clientName: clientColumns.clientName,
      ...ratedColumns,
    })
    .from(payments)
    .leftJoin(organizations, eq(organizations.id, payments.organizationId))
    .leftJoin(contacts, eq(contacts.id, payments.contactId))
    .where(paidBy(ownerId, range))
    .groupBy(payments.organizationId, payments.contactId, organizations.name, contacts.fullName, ...ratedGroup);

  const clients = byKey(rows, (row) => row.organizationId ?? row.contactId, options.baseCurrency)
    .map(({ first, sum }) => {
      const client: ClientKey = first.organizationId
        ? { organizationId: first.organizationId }
        : { contactId: first.contactId! };
      return { client, name: first.clientName, ...sum };
    })
    .sort((a, b) => b.minor - a.minor || a.name.localeCompare(b.name));
  const offset = options.offset ?? 0;
  return {
    rows: clients.slice(offset, offset + (options.limit ?? PAGE)),
    total: clients.length,
  };
}

// Each allocation of a payment in the range, split across its invoice's lines by their
// amounts, so a payment towards an invoice of design and hosting counts towards both.
// One row per allocation and line; `share` is exact, in the payment's minor units.
const shares = (ownerId: string, range: DateRange) => sql`
  select
    ${invoiceLines.serviceCategory} as service,
    ${payments.id} as payment_id,
    ${payments.receivedOn} as received_on,
    ${payments.currency} as currency,
    ${payments.fxRateToBase} as rate,
    ${invoices.id} as invoice_id,
    ${invoices.number} as invoice_number,
    coalesce(${organizations.name}, ${contacts.fullName}) as client_name,
    ${paymentAllocations.amountMinor}::numeric * ${invoiceLines.amountMinor}
      / nullif(sum(${invoiceLines.amountMinor}) over (partition by ${paymentAllocations.id}), 0) as share
  from ${paymentAllocations}
  join ${payments} on ${payments.id} = ${paymentAllocations.paymentId}
  join ${invoices} on ${invoices.id} = ${paymentAllocations.invoiceId}
  join ${invoiceLines} on ${invoiceLines.invoiceId} = ${invoices.id}
  left join ${organizations} on ${organizations.id} = ${invoices.organizationId}
  left join ${contacts} on ${contacts.id} = ${invoices.contactId}
  where ${paidBy(ownerId, range)} and ${eq(invoices.ownerId, ownerId)}
`;

type RawSum = { currency: string; rated: boolean; count: number; minor: string; product: string | null };
const rated = (row: RawSum): RatedSum => ({ ...row, minor: Number(row.minor) });

// Money received in the range by the service its invoice lines name, in the base
// currency, most first; what payments have not yet been put towards is a row of its own.
// A service's sum is rounded once, so the rows may differ from Received by a minor unit.
export async function revenueByService(
  ownerId: string,
  range: DateRange,
  options: { baseCurrency: string },
) {
  const served = await db.execute<RawSum & { service: string | null }>(sql`
    select service, currency, rate is not null as rated,
      count(distinct payment_id)::int as count,
      round(sum(share))::bigint as minor,
      sum(share * rate)::text as product
    from (${shares(ownerId, range)}) shares
    where share is not null
    group by service, currency, rate is not null
  `);
  const leftover = sql`(${payments.amountMinor} - ${paymentAllocated})`;
  const unallocated = await db
    .select({
      currency: payments.currency,
      rated: ratedColumns.rated,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`sum(${leftover})::bigint`.mapWith(Number),
      product: sql<string | null>`sum(${leftover} * ${payments.fxRateToBase})::text`,
    })
    .from(payments)
    .where(and(paidBy(ownerId, range), sql`${leftover} > 0`))
    .groupBy(...ratedGroup);

  const services = byKey(served.rows.map((row) => ({ ...rated(row), service: row.service })), (row) => row.service, options.baseCurrency)
    .map(({ key, sum }) => ({ service: key, ...sum }))
    .sort((a, b) => b.minor - a.minor || (a.service ?? "").localeCompare(b.service ?? ""));
  return { services, unallocated: inBase(unallocated, options.baseCurrency) };
}

// The shares one service was paid, newest first: `null` for lines that name none.
export async function serviceRows(
  ownerId: string,
  range: DateRange,
  service: string | null,
  options: { offset?: number; limit?: number } = {},
) {
  const limit = options.limit ?? PAGE;
  const named = service === null ? sql`service is null` : sql`service = ${service}`;
  const result = await db.execute<{
    payment_id: string;
    received_on: string;
    currency: string;
    invoice_id: string;
    invoice_number: string;
    client_name: string;
    minor: string;
    total: number;
  }>(sql`
    select payment_id, received_on::text, currency, invoice_id, invoice_number, client_name,
      round(sum(share))::bigint as minor, count(*) over ()::int as total
    from (${shares(ownerId, range)}) shares
    where share is not null and ${named}
    group by payment_id, received_on, currency, invoice_id, invoice_number, client_name
    order by received_on desc, invoice_number, payment_id
    limit ${limit} offset ${options.offset ?? 0}
  `);
  return {
    rows: result.rows.map((row) => ({
      paymentId: row.payment_id,
      receivedOn: row.received_on,
      currency: row.currency,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      clientName: row.client_name,
      minor: Number(row.minor),
    })),
    total: result.rows[0]?.total ?? 0,
  };
}

// Payments received in the range that still hold money not put towards an invoice.
export async function unallocatedRows(
  ownerId: string,
  range: DateRange,
  options: { offset?: number; limit?: number } = {},
) {
  const leftover = sql<number>`(${payments.amountMinor} - ${paymentAllocated})::bigint`.mapWith(Number);
  const matching = and(paidBy(ownerId, range), sql`${leftover} > 0`);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: payments.id,
        receivedOn: payments.receivedOn,
        currency: payments.currency,
        amountMinor: payments.amountMinor,
        leftover,
        clientName: clientColumns.clientName,
      })
      .from(payments)
      .leftJoin(organizations, eq(organizations.id, payments.organizationId))
      .leftJoin(contacts, eq(contacts.id, payments.contactId))
      .where(matching)
      .orderBy(desc(payments.receivedOn), asc(payments.id))
      .limit(options.limit ?? PAGE)
      .offset(options.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(payments).where(matching),
  ]);
  return { rows, total };
}

// Invoices paid in full in the range: the day the last payment towards them arrived, or
// the day they were issued when that money had come in before (an advance).
function paidInFull(ownerId: string, range: DateRange, today: string) {
  const paidOn = sql<string>`greatest(max(${payments.receivedOn}), ${invoices.issueDate})`;
  const bounds: (SQL | undefined)[] = [
    range.from ? sql`${paidOn} >= ${range.from}` : undefined,
    range.to ? sql`${paidOn} <= ${range.to}` : undefined,
  ];
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      issueDate: invoices.issueDate,
      clientName: sql<string>`coalesce(${organizations.name}, ${contacts.fullName})`.as("client_name"),
      paidOn: sql<string>`${paidOn}::text`.as("paid_on"),
      days: sql<number>`(${paidOn} - ${invoices.issueDate})::int`.as("days"),
    })
    .from(invoices)
    .innerJoin(paymentAllocations, eq(paymentAllocations.invoiceId, invoices.id))
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
    .leftJoin(contacts, eq(contacts.id, invoices.contactId))
    .where(and(eq(invoices.ownerId, ownerId), eq(payments.ownerId, ownerId), stateIs("paid", today)))
    .groupBy(invoices.id, organizations.name, contacts.fullName)
    .having(and(...bounds))
    .as("paid");
}

// The mean number of days from issue to paid in full, over the invoices paid in full in
// the range; `null` when there are none.
export async function timeToPayment(ownerId: string, range: DateRange, today: string) {
  const paid = paidInFull(ownerId, range, today);
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      days: sql<number | null>`round(avg(${paid.days}))::int`,
    })
    .from(paid);
  return { count: row.count, days: row.count === 0 ? null : row.days };
}

export async function timeToPaymentRows(
  ownerId: string,
  range: DateRange,
  today: string,
  options: { offset?: number; limit?: number } = {},
) {
  const paid = paidInFull(ownerId, range, today);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(paid)
      .orderBy(desc(paid.paidOn), asc(paid.number))
      .limit(options.limit ?? PAGE)
      .offset(options.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(paid),
  ]);
  return { rows, total };
}
