import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

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
