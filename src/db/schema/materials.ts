import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { citext, createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { files } from "./files";

export const MATERIAL_TYPES = [
  "proposal",
  "quote",
  "deck",
  "portfolio",
  "contract",
  "report",
  "design",
  "deliverable",
  "link",
  "other",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

// Something the owner sends to clients again and again, kept once in a library.
export const materials = pgTable(
  "materials",
  {
    id: id(),
    ownerId: ownerId(),
    name: citext("name").notNull(),
    type: text("type").$type<MaterialType>().notNull(),
    description: text("description"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("materials_type_check", oneOf(table.type, MATERIAL_TYPES)),
    uniqueIndex("materials_owner_name_idx").on(table.ownerId, table.name),
  ],
);

// One version of a material: a link, or a file whose bytes are stored once in `files`.
export const materialVersions = pgTable(
  "material_versions",
  {
    id: id(),
    ownerId: ownerId(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url"),
    fileId: uuid("file_id").references(() => files.id),
    // The name a file was uploaded under, which a download is saved as.
    title: text("title"),
    createdAt,
  },
  (table) => [
    check(
      "material_versions_target_check",
      sql`num_nonnulls(${table.url}, ${table.fileId}) = 1`,
    ),
    index("material_versions_material_idx").on(table.materialId, table.createdAt),
    index("material_versions_file_idx").on(table.fileId),
  ],
);
