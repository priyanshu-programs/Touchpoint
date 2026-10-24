import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, id, ownerId, updatedAt } from "./columns";
import { files } from "./files";
import type { BoardScene } from "./workflows";

// A whiteboard of the owner's own for thinking things through: no stages, and
// belonging to no company and no person.
export const brainstormBoards = pgTable(
  "brainstorm_boards",
  {
    id: id(),
    ownerId: ownerId(),
    name: citext("name").notNull(),
    // One of the keys in src/modules/workflows/icons.ts, as a workflow's is.
    icon: text("icon"),
    scene: jsonb("scene").$type<BoardScene>().notNull().default({ elements: [] }),
    // Goes up with every save; a save made from an older one is refused.
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("brainstorm_boards_icon_check", sql`${table.icon} ~ '^[a-z0-9-]{1,32}$'`),
    uniqueIndex("brainstorm_boards_owner_name_idx").on(table.ownerId, table.name),
    index("brainstorm_boards_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

// A picture drawn on a brainstorm board, kept as a workflow board's is.
export const brainstormPictures = pgTable(
  "brainstorm_pictures",
  {
    id: id(),
    ownerId: ownerId(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => brainstormBoards.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("brainstorm_pictures_board_key_idx").on(table.boardId, table.fileKey),
    index("brainstorm_pictures_file_idx").on(table.fileId),
  ],
);
