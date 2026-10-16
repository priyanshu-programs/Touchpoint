import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { contacts, organizations } from "./people";

export const ENGAGEMENT_STATUSES = [
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

// Paid work agreed with a company: a project, a retainer, a piece of delivery.
export const engagements = pgTable(
  "engagements",
  {
    id: id(),
    ownerId: ownerId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scope: text("scope"),
    objectives: text("objectives"),
    status: text("status").notNull().default("planned"),
    // In the currency's minor units (paise, cents), so no sum is ever rounded.
    valueMinor: bigint("value_minor", { mode: "number" }),
    currency: text("currency").notNull(),
    paymentTerms: text("payment_terms"),
    startDate: date("start_date", { mode: "string" }),
    targetEndDate: date("target_end_date", { mode: "string" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("engagements_status_check", oneOf(table.status, ENGAGEMENT_STATUSES)),
    check("engagements_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "engagements_value_check",
      sql`${table.valueMinor} is null or ${table.valueMinor} >= 0`,
    ),
    check(
      "engagements_dates_check",
      sql`${table.startDate} is null or ${table.targetEndDate} is null or ${table.targetEndDate} >= ${table.startDate}`,
    ),
    index("engagements_owner_status_idx").on(table.ownerId, table.status),
    index("engagements_organization_idx").on(table.organizationId),
  ],
);

// The client's people on an engagement, each with the part they play in it.
export const engagementContacts = pgTable(
  "engagement_contacts",
  {
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.engagementId, table.contactId] }),
    index("engagement_contacts_contact_idx").on(table.contactId),
  ],
);
