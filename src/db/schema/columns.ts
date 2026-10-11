import { sql } from "drizzle-orm";
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// For CHECK constraints over a fixed list of code-defined values.
export const oneOf = (column: unknown, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

export const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull();
export const archivedAt = timestamp("archived_at", { withTimezone: true });

export const id = () => uuid("id").defaultRandom().primaryKey();
export const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});
export const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});
