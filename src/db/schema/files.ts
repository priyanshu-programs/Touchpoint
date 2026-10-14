import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { bytea, createdAt, id, ownerId } from "./columns";

// A file the owner uploaded. It is kept in the database because the hosting has
// no disk of its own, and once per owner however many places point at it.
export const files = pgTable(
  "files",
  {
    id: id(),
    ownerId: ownerId(),
    // Read from the bytes when the file was stored, never taken from the upload.
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt,
  },
  (table) => [uniqueIndex("files_owner_sha256_idx").on(table.ownerId, table.sha256)],
);
