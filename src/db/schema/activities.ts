import { type SQL, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { NoteMark } from "../../modules/workflows/note-marks";
import {
  createdAt,
  id,
  oneOf,
  ownerId,
  tsvector,
  updatedAt,
} from "./columns";
import { files } from "./files";
import { calendarEvents } from "./integrations";
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
    // Which characters of the body are bold, italic or underlined (note-marks.ts).
    marks: jsonb("marks").$type<NoteMark[]>().notNull().default([]),
    outcome: text("outcome"),
    source: text("source").notNull().default("manual"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    // The meeting whose notes and files these are. The meeting's copy goes when Google is
    // disconnected; its notes stay, as an ordinary activity.
    calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, {
      onDelete: "set null",
    }),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', ${activities.title} || ' ' || coalesce(${activities.body}, '') || ' ' || coalesce(${activities.outcome}, ''))`,
    ),
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
    index("activities_search_idx").using("gin", table.search),
    uniqueIndex("activities_owner_calendar_event_idx")
      .on(table.ownerId, table.calendarEventId)
      .where(sql`${table.calendarEventId} is not null`),
  ],
);

// A file kept with an activity: so far, one uploaded into a meeting's notes.
export const activityFiles = pgTable(
  "activity_files",
  {
    id: id(),
    ownerId: ownerId(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    title: text("title").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt,
  },
  (table) => [
    index("activity_files_activity_idx").on(table.activityId),
    index("activity_files_file_idx").on(table.fileId),
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

// One row per thing that happened to a record: activities, materials sent (whose
// kind is the channel, title the material and version, and body the note) and meetings
// that have started (whose kind is meeting or all_day, and body the location). Payments
// join the union when their table exists, so system events are never copied into the
// activities table. An all-day meeting has a date and no zone: noon UTC keeps it on that
// date in nearly every zone the page turns it into.
export const timeline = pgView("timeline", {
  ownerId: uuid("owner_id").notNull(),
  eventType: text("event_type")
    .$type<"activity" | "material_send" | "calendar_event">()
    .notNull(),
  eventId: uuid("event_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  kind: text("kind").notNull(),
  direction: text("direction"),
  title: text("title").notNull(),
  body: text("body"),
  outcome: text("outcome"),
  organizationId: uuid("organization_id"),
  contactIds: uuid("contact_ids").array().notNull(),
  // A send's own: where its material is, and how it was received.
  materialId: uuid("material_id"),
  status: text("status"),
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
    ) as contact_ids,
    null::uuid as material_id,
    null::text as status
  from activities a
  union all
  select
    s.owner_id,
    'material_send'::text as event_type,
    s.id as event_id,
    s.sent_at as occurred_at,
    s.channel as kind,
    null::text as direction,
    m.name::text || ' · ' || v.label as title,
    s.note as body,
    null::text as outcome,
    s.organization_id,
    array(
      select r.contact_id from material_send_recipients r where r.send_id = s.id
    ) as contact_ids,
    m.id as material_id,
    s.status
  from material_sends s
  join material_versions v on v.id = s.version_id
  join materials m on m.id = v.material_id
  union all
  select
    e.owner_id,
    'calendar_event'::text as event_type,
    e.id as event_id,
    case
      when e.all_day then (e.starts_on + time '12:00') at time zone 'UTC'
      else e.starts_at
    end as occurred_at,
    case when e.all_day then 'all_day' else 'meeting' end as kind,
    null::text as direction,
    e.title,
    e.location as body,
    null::text as outcome,
    e.organization_id,
    array(
      select ec.contact_id from calendar_event_contacts ec where ec.event_id = e.id
    ) as contact_ids,
    null::uuid as material_id,
    null::text as status
  from calendar_events e
  where e.starts_at <= now() or e.starts_on <= current_date
`);
