import { type SQL, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAt,
  id,
  oneOf,
  ownerId,
  tsvector,
  updatedAt,
} from "./columns";
import { contacts, organizations } from "./people";

export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_ORIGINS = [
  "manual",
  "follow_up",
  "workflow",
  "ai",
  "meeting",
] as const;
export const REMINDER_STATUSES = ["scheduled", "sent", "cancelled"] as const;

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    ownerId: ownerId(),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    // The owner's calendar date the task is due on. Queries compare this date only, so no
    // time zone name ever reaches Postgres (stock images lack legacy names such as Asia/Calcutta).
    dueOn: date("due_on", { mode: "string" }),
    // Set as well when the task has a time of day.
    dueAt: timestamp("due_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    recurrenceRule: text("recurrence_rule"),
    origin: text("origin").notNull().default("manual"),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', ${tasks.title} || ' ' || coalesce(${tasks.notes}, ''))`,
    ),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("tasks_status_check", oneOf(table.status, TASK_STATUSES)),
    check("tasks_priority_check", oneOf(table.priority, TASK_PRIORITIES)),
    check("tasks_origin_check", oneOf(table.origin, TASK_ORIGINS)),
    check(
      "tasks_due_time_has_date_check",
      sql`${table.dueAt} is null or ${table.dueOn} is not null`,
    ),
    index("tasks_owner_status_due_idx").on(
      table.ownerId,
      table.status,
      table.dueOn,
    ),
    index("tasks_contact_idx").on(table.contactId),
    index("tasks_organization_idx").on(table.organizationId),
    index("tasks_search_idx").using("gin", table.search),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    ownerId: ownerId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    channel: text("channel").notNull().default("in_app"),
    status: text("status").notNull().default("scheduled"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    check("reminders_channel_check", oneOf(table.channel, ["in_app"])),
    check("reminders_status_check", oneOf(table.status, REMINDER_STATUSES)),
    index("reminders_task_idx").on(table.taskId),
    index("reminders_owner_status_idx").on(table.ownerId, table.status),
  ],
);
