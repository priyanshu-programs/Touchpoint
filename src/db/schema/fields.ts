import {
  check,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";

export const FIELD_ENTITY_TYPES = ["organization", "contact"] as const;
export const CUSTOM_FIELD_TYPES = ["text", "number", "select", "date"] as const;

// What a record keeps in its `custom` column, by the key of the field.
export type CustomValues = Record<string, string | number>;

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

// A field the owner added to every company or every person. Its values live in
// the record's `custom` column under `key`, which never changes once given.
export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: id(),
    ownerId: ownerId(),
    entityType: text("entity_type")
      .$type<(typeof FIELD_ENTITY_TYPES)[number]>()
      .notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").$type<(typeof CUSTOM_FIELD_TYPES)[number]>().notNull(),
    // What a select offers; empty for every other type.
    options: jsonb("options").$type<string[]>().notNull().default([]),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "custom_field_defs_entity_type_check",
      oneOf(table.entityType, FIELD_ENTITY_TYPES),
    ),
    check("custom_field_defs_type_check", oneOf(table.type, CUSTOM_FIELD_TYPES)),
    uniqueIndex("custom_field_defs_owner_entity_key_idx").on(
      table.ownerId,
      table.entityType,
      table.key,
    ),
  ],
);
