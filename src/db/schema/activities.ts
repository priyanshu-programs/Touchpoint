import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { contacts, organizations } from "./people";

export const ACTIVITY_KINDS = [
  "note",
  "call",
  "meeting",
  "email",
  "linkedin",
  "message",
  "decision",
  "objection",
  "commitment",
] as const;
export const ACTIVITY_DIRECTIONS = ["inbound", "outbound"] as const;
export const ACTIVITY_SOURCES = ["manual", "gmail", "calendar", "ai"] as const;

export const activities = pgTable(
  "activities",
  {
    id: id(),
    ownerId: ownerId(),
    kind: text("kind").notNull(),
    direction: text("direction"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    outcome: text("outcome"),
    source: text("source").notNull().default("manual"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("activities_kind_check", oneOf(table.kind, ACTIVITY_KINDS)),
    check(
      "activities_direction_check",
      oneOf(table.direction, ACTIVITY_DIRECTIONS),
    ),
    check("activities_source_check", oneOf(table.source, ACTIVITY_SOURCES)),
    index("activities_owner_occurred_idx").on(
      table.ownerId,
      table.occurredAt,
      table.id,
    ),
    index("activities_organization_idx").on(table.organizationId),
  ],
);

export const activityContacts = pgTable(
  "activity_contacts",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.contactId] }),
    index("activity_contacts_contact_idx").on(table.contactId),
  ],
);

// One row per thing that happened to a record. Only activities feed it so far; stage
// transitions, material sends and payments join the union when their tables exist, so
// system events are never copied into the activities table.
export const timeline = pgView("timeline", {
  ownerId: uuid("owner_id").notNull(),
  eventType: text("event_type").notNull(),
  eventId: uuid("event_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  kind: text("kind").notNull(),
  direction: text("direction"),
  title: text("title").notNull(),
  body: text("body"),
  outcome: text("outcome"),
  organizationId: uuid("organization_id"),
  contactIds: uuid("contact_ids").array().notNull(),
}).as(sql`
  select
    a.owner_id,
    'activity'::text as event_type,
    a.id as event_id,
    a.occurred_at,
    a.kind,
    a.direction,
    a.title,
    a.body,
    a.outcome,
    a.organization_id,
    array(
      select ac.contact_id from activity_contacts ac where ac.activity_id = a.id
    ) as contact_ids
  from activities a
`);
