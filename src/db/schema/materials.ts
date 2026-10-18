import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { files } from "./files";
import { contacts, organizations } from "./people";

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

export const SEND_CHANNELS = ["email", "whatsapp", "linkedin", "in_person", "other"] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];
export const SEND_STATUSES = ["sent", "viewed", "accepted", "rejected", "superseded"] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

// One version of a material going to one or more people. It shows on their and the
// company's timeline. A version that has been sent is kept; deleting the material
// takes its sends with it.
export const materialSends = pgTable(
  "material_sends",
  {
    id: id(),
    ownerId: ownerId(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => materialVersions.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    channel: text("channel").$type<SendChannel>().notNull(),
    status: text("status").$type<SendStatus>().notNull().default("sent"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("material_sends_channel_check", oneOf(table.channel, SEND_CHANNELS)),
    check("material_sends_status_check", oneOf(table.status, SEND_STATUSES)),
    index("material_sends_version_idx").on(table.versionId),
    index("material_sends_owner_sent_idx").on(table.ownerId, table.sentAt, table.id),
    index("material_sends_organization_idx").on(table.organizationId),
  ],
);

export const materialSendRecipients = pgTable(
  "material_send_recipients",
  {
    sendId: uuid("send_id")
      .notNull()
      .references(() => materialSends.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (table) => [
    primaryKey({ columns: [table.sendId, table.contactId] }),
    index("material_send_recipients_contact_idx").on(table.contactId),
  ],
);
