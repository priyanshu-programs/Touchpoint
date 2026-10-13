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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { citext, createdAt, id, ownerId, updatedAt } from "./columns";
import { contacts, organizations } from "./people";

export const STAGE_STATUSES = [
  "not_started",
  "in_progress",
  "done",
  "blocked",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

// A box of the drawing that was made a stage, named by the text inside it.
export type BoardStage = { elementId: string; name: string; status: StageStatus };
// The drawing as the whiteboard gave it. Only the fields the schema in
// src/modules/workflows checks are ever read here.
export type BoardScene = { elements: Record<string, unknown>[] };

// A workflow drawn on a whiteboard. One that belongs to no company and no person
// is a template; a copy started on a record is that record's own.
export const workflowBoards = pgTable(
  "workflow_boards",
  {
    id: id(),
    ownerId: ownerId(),
    name: citext("name").notNull(),
    description: text("description"),
    scene: jsonb("scene").$type<BoardScene>().notNull().default({ elements: [] }),
    // Worked out from the scene on every save, so a list never has to open a drawing.
    stages: jsonb("stages").$type<BoardStage[]>().notNull().default([]),
    // Goes up with every save; a save made from an older one is refused.
    version: integer("version").notNull().default(1),
    // The starter it was added from, which is then no longer offered.
    starterKey: text("starter_key"),
    sourceBoardId: uuid("source_board_id").references(
      (): AnyPgColumn => workflowBoards.id,
      { onDelete: "set null" },
    ),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "workflow_boards_subject_check",
      sql`num_nonnulls(${table.organizationId}, ${table.contactId}) <= 1`,
    ),
    uniqueIndex("workflow_boards_template_name_idx")
      .on(table.ownerId, table.name)
      .where(sql`${table.organizationId} is null and ${table.contactId} is null`),
    index("workflow_boards_organization_idx").on(table.organizationId),
    index("workflow_boards_contact_idx").on(table.contactId),
  ],
);
