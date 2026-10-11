import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

export const settings = pgTable(
  "settings",
  {
    ownerId: uuid("owner_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    timezone: text("timezone").notNull(),
    weekStart: smallint("week_start").notNull().default(1),
    fiscalYearStartMonth: smallint("fiscal_year_start_month")
      .notNull()
      .default(1),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("settings_week_start_check", sql`${table.weekStart} between 0 and 6`),
    check(
      "settings_fiscal_month_check",
      sql`${table.fiscalYearStartMonth} between 1 and 12`,
    ),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt,
  },
  (table) => [
    check(
      "audit_log_actor_check",
      sql`${table.actor} in ('user', 'ai', 'job', 'system')`,
    ),
    index("audit_log_owner_created_idx").on(
      table.ownerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Null for instance-wide jobs such as the scheduler heartbeat.
    ownerId: uuid("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    lastError: text("last_error"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "jobs_status_check",
      sql`${table.status} in ('pending', 'running', 'done', 'failed')`,
    ),
    index("jobs_due_idx").on(table.status, table.runAt),
    // Only one live job per key; finished jobs do not block re-enqueueing.
    uniqueIndex("jobs_dedupe_live_idx")
      .on(table.dedupeKey)
      .where(sql`${table.status} in ('pending', 'running')`),
  ],
);
