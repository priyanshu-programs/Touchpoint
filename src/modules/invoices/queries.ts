import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contacts,
  files,
  invoiceAdjustments,
  invoiceLines,
  invoices,
  organizations,
  type InvoiceStatus,
} from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { logoVersion } from "@/modules/organizations/queries";
import type { InvoiceSort } from "./schema";

const ownedBy = (ownerId: string) => eq(invoices.ownerId, ownerId);

const linesTotal = sql`(
  select coalesce(sum(l.amount_minor), 0) from invoice_lines l where l.invoice_id = "invoices"."id"
)`;
const adjustmentsTotal = sql`(
  select coalesce(sum(a.amount_minor), 0) from invoice_adjustments a where a.invoice_id = "invoices"."id"
)`;
// Worked out each time from the lines and adjustments, never stored.
export const invoiceTotal = sql<number>`(${linesTotal} - ${adjustmentsTotal})::bigint`.mapWith(
  Number,
);

// Who the invoice bills, a company or a person, with the picture to show beside them.
const clientColumns = {
  organizationId: invoices.organizationId,
  contactId: invoices.contactId,
  clientName: sql<string>`coalesce(${organizations.name}, ${contacts.fullName})`,
  logoVersion: sql<string | null>`case when ${invoices.organizationId} is not null then ${logoVersion} end`,
  photoVersion: sql<string | null>`case when ${invoices.contactId} is not null then ${photoVersion} end`,
};

const SORT_BY: Record<InvoiceSort, ReturnType<typeof sql>> = {
  number: sql`lower(${invoices.number})`,
  issued: sql`${invoices.issueDate}`,
  due: sql`${invoices.dueDate}`,
  total: invoiceTotal,
};

const contains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export async function listInvoices(
  ownerId: string,
  options: {
    q?: string;
    status?: InvoiceStatus;
    currency?: string;
    organizationId?: string;
    contactId?: string;
    sort?: InvoiceSort;
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
    options.status ? eq(invoices.status, options.status) : undefined,
    options.currency ? eq(invoices.currency, options.currency) : undefined,
    options.organizationId ? eq(invoices.organizationId, options.organizationId) : undefined,
    options.contactId ? eq(invoices.contactId, options.contactId) : undefined,
    q
      ? or(
          sql`${invoices.number} ilike ${contains(q)}`,
          sql`${organizations.name} ilike ${contains(q)}`,
          sql`${contacts.fullName} ilike ${contains(q)}`,
        )
      : undefined,
  );

  const base = () =>
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        total: invoiceTotal,
        ...clientColumns,
      })
      .from(invoices)
      .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
      .leftJoin(contacts, eq(contacts.id, invoices.contactId));

  const [rows, [{ total }]] = await Promise.all([
    base()
      .where(matching)
      // The newest issued first by default; the number and id keep pages stable.
      .orderBy(
        sql`${SORT_BY[options.sort ?? "issued"]} ${direction}`,
        desc(sql`lower(${invoices.number})`),
        asc(invoices.id),
      )
      .limit(limit + 1)
      .offset(options.offset ?? 0),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
      .leftJoin(contacts, eq(contacts.id, invoices.contactId))
      .where(matching),
  ]);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, total };
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>["rows"][number];

// The currencies the owner's invoices are in, for the list's filter.
export async function invoiceCurrencies(ownerId: string) {
  const rows = await db
    .selectDistinct({ currency: invoices.currency })
    .from(invoices)
    .where(ownedBy(ownerId))
    .orderBy(asc(invoices.currency));
  return rows.map(({ currency }) => currency);
}

// The kinds of work already billed, offered again on the form.
export async function serviceCategories(ownerId: string) {
  const rows = await db
    .selectDistinct({ category: invoiceLines.serviceCategory })
    .from(invoiceLines)
    .where(and(eq(invoiceLines.ownerId, ownerId), isNotNull(invoiceLines.serviceCategory)))
    .orderBy(asc(invoiceLines.serviceCategory))
    .limit(100);
  return rows.map(({ category }) => category!);
}

// An invoice with its lines, adjustments and totals. Never a file's bytes.
export async function getInvoice(ownerId: string, id: string) {
  const [row] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      notes: invoices.notes,
      fileName: invoices.fileName,
      fileSize: files.size,
      fileType: files.contentType,
      createdAt: invoices.createdAt,
      ...clientColumns,
    })
    .from(invoices)
    .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
    .leftJoin(contacts, eq(contacts.id, invoices.contactId))
    .leftJoin(files, eq(files.id, invoices.fileId))
    .where(and(ownedBy(ownerId), eq(invoices.id, id)));
  if (!row) return null;

  const [lines, adjustments] = await Promise.all([
    db
      .select({
        description: invoiceLines.description,
        quantity: invoiceLines.quantity,
        unitAmountMinor: invoiceLines.unitAmountMinor,
        amountMinor: invoiceLines.amountMinor,
        serviceCategory: invoiceLines.serviceCategory,
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id))
      .orderBy(asc(invoiceLines.position)),
    db
      .select({ reason: invoiceAdjustments.reason, amountMinor: invoiceAdjustments.amountMinor })
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.invoiceId, id))
      .orderBy(asc(invoiceAdjustments.position)),
  ]);
  const subtotal = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const off = adjustments.reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);

  return { ...row, lines, adjustments, subtotal, total: subtotal - off };
}

export type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

// The invoices billing one company or person, the newest issued first.
export async function invoicesOfRecord(
  ownerId: string,
  client: { organizationId: string } | { contactId: string },
) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      total: invoiceTotal,
    })
    .from(invoices)
    .where(
      and(
        ownedBy(ownerId),
        "organizationId" in client
          ? eq(invoices.organizationId, client.organizationId)
          : eq(invoices.contactId, client.contactId),
      ),
    )
    .orderBy(desc(invoices.issueDate), desc(sql`lower(${invoices.number})`), asc(invoices.id))
    .limit(100);
}

export async function getInvoiceFile(ownerId: string, id: string) {
  const [file] = await db
    .select({ fileName: invoices.fileName, contentType: files.contentType, bytes: files.bytes })
    .from(invoices)
    .innerJoin(files, eq(files.id, invoices.fileId))
    .where(and(ownedBy(ownerId), eq(invoices.id, id)));
  return file ?? null;
}

// How many invoices bill one company or person, which keeps it from being deleted.
export async function invoiceCount(
  ownerId: string,
  client: { organizationId: string } | { contactId: string },
) {
  return db.$count(
    invoices,
    and(
      ownedBy(ownerId),
      "organizationId" in client
        ? eq(invoices.organizationId, client.organizationId)
        : eq(invoices.contactId, client.contactId),
    ),
  );
}
