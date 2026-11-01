import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    // Where the drawing was kept before each element had a row of its own.
    // Migration 0034 moved it out and left this empty; to be dropped.
    scene: jsonb("scene").$type<BoardScene>().notNull().default({ elements: [] }),
    // No longer read since 0034, for the same reason.
    version: integer("version").notNull().default(1),
    // Goes up with every save that changes an element, and each changed
    // element keeps the clock it was changed at: a device asks for what has
    // changed since the clock it last saw.
    clock: bigint("clock", { mode: "number" }).notNull().default(0),
    // The elements not deleted and the bytes they take: what the limits count.
    live: integer("live").notNull().default(0),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    // The clock when deleted elements were last cleared away. A device that
    // last saw an older one cannot be told of those, so it loads the board again.
    pruned: bigint("pruned", { mode: "number" }).notNull().default(0),
    // Where the owner has put it on the Brainstorming page, lowest first.
    position: integer("position").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("brainstorm_boards_icon_check", sql`${table.icon} ~ '^[a-z0-9-]{1,32}$'`),
    uniqueIndex("brainstorm_boards_owner_name_idx").on(table.ownerId, table.name),
    index("brainstorm_boards_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("brainstorm_boards_owner_position_idx").on(table.ownerId, table.position),
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

// One element of a brainstorm board's drawing: a stroke, a box, a line of text,
// kept as the whiteboard gives it. Each carries the whiteboard's own version of
// it, so two devices drawing on one board are merged element by element, the
// way the whiteboard merges a drawing shared live.
export const brainstormElements = pgTable(
  "brainstorm_elements",
  {
    ownerId: ownerId(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => brainstormBoards.id, { onDelete: "cascade" }),
    elementId: text("element_id").notNull(),
    version: integer("version").notNull(),
    versionNonce: integer("version_nonce").notNull(),
    // Kept a while once deleted, so an older copy elsewhere cannot bring it back.
    deleted: boolean("deleted").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    // The bytes of `data` as it was sent.
    size: integer("size").notNull(),
    clock: bigint("clock", { mode: "number" }).notNull(),
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.elementId] }),
    index("brainstorm_elements_board_clock_idx").on(table.boardId, table.clock),
  ],
);
