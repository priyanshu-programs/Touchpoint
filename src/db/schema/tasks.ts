import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
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
    // An all-day task has a date and no instant, so "due today" never shifts with the time zone.
    dueOn: date("due_on", { mode: "string" }),
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
    createdAt,
    updatedAt,
  },
  (table) => [
    check("tasks_status_check", oneOf(table.status, TASK_STATUSES)),
    check("tasks_priority_check", oneOf(table.priority, TASK_PRIORITIES)),
    check("tasks_origin_check", oneOf(table.origin, TASK_ORIGINS)),
    check(
      "tasks_single_due_check",
      sql`${table.dueOn} is null or ${table.dueAt} is null`,
    ),
    index("tasks_owner_status_idx").on(table.ownerId, table.status),
    index("tasks_contact_idx").on(table.contactId),
    index("tasks_organization_idx").on(table.organizationId),
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
