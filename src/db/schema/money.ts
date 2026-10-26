import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { files } from "./files";
import { contacts, organizations } from "./people";

export const INVOICE_STATUSES = ["draft", "issued", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// A record of an invoice the owner made elsewhere (in Figma), so what was billed
// adds up. Paid, partly paid and overdue are worked out, never stored. A company
// or person with invoices is refused deletion, so an invoice always has its client.
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    ownerId: ownerId(),
    // As printed on the invoice itself.
    number: citext("number").notNull(),
    // No action, not restrict: checked at the end of the statement, so the owner's
    // account can still go with everything in it.
    organizationId: uuid("organization_id").references(() => organizations.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    notes: text("notes"),
    // The exported invoice, its bytes stored once in `files`.
    fileId: uuid("file_id").references(() => files.id),
    fileName: text("file_name"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("invoices_status_check", oneOf(table.status, INVOICE_STATUSES)),
    check("invoices_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "invoices_client_check",
      sql`num_nonnulls(${table.organizationId}, ${table.contactId}) = 1`,
    ),
    check("invoices_dates_check", sql`${table.dueDate} >= ${table.issueDate}`),
    check(
      "invoices_file_check",
      sql`(${table.fileId} is null) = (${table.fileName} is null)`,
    ),
    uniqueIndex("invoices_owner_number_idx").on(table.ownerId, table.number),
    index("invoices_owner_issue_idx").on(table.ownerId, table.issueDate),
    index("invoices_organization_idx").on(table.organizationId),
    index("invoices_contact_idx").on(table.contactId),
    index("invoices_file_idx").on(table.fileId),
  ],
);

// Amounts are whole minor units of the invoice's currency (paise, cents).
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    ownerId: ownerId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitAmountMinor: bigint("unit_amount_minor", { mode: "number" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    // What kind of work it was, which revenue is reported by.
    serviceCategory: text("service_category"),
  },
  (table) => [
    check("invoice_lines_quantity_check", sql`${table.quantity} > 0`),
    check("invoice_lines_unit_check", sql`${table.unitAmountMinor} >= 0`),
    check("invoice_lines_amount_check", sql`${table.amountMinor} >= 0`),
    uniqueIndex("invoice_lines_position_idx").on(table.invoiceId, table.position),
  ],
);

// A discount or write-off, taken off the total and kept visible.
export const invoiceAdjustments = pgTable(
  "invoice_adjustments",
  {
    id: id(),
    ownerId: ownerId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    reason: text("reason").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (table) => [
    check("invoice_adjustments_amount_check", sql`${table.amountMinor} > 0`),
    uniqueIndex("invoice_adjustments_position_idx").on(
      table.invoiceId,
      table.position,
    ),
  ],
);
