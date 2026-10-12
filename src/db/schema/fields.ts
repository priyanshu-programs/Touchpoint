import { check, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { oneOf, ownerId, updatedAt } from "./columns";

export const FIELD_ENTITY_TYPES = ["organization", "contact"] as const;

// The order of a record's Details and which fields are left out of it.
// No row means the built-in order with nothing hidden.
export const fieldLayouts = pgTable(
  "field_layouts",
  {
    ownerId: ownerId(),
    entityType: text("entity_type").notNull(),
    fields: jsonb("fields")
      .$type<{ key: string; hidden: boolean }[]>()
      .notNull(),
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.entityType] }),
    check(
      "field_layouts_entity_type_check",
      oneOf(table.entityType, FIELD_ENTITY_TYPES),
    ),
  ],
);
