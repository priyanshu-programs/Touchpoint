import { sql } from "drizzle-orm";
import {
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
import { citext, createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import type { TASK_PRIORITIES } from "./tasks";

// `won`, `lost` and `done` end a workflow; nothing leads on from them.
export const STAGE_KINDS = ["normal", "won", "lost", "done"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export type ChecklistItem = { id: string; label: string; required: boolean };
// A task made when a workflow enters the stage, due that many days later.
export type StageTask = {
  title: string;
  offsetDays: number;
  priority: (typeof TASK_PRIORITIES)[number];
};

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: id(),
    ownerId: ownerId(),
    name: citext("name").notNull(),
    description: text("description"),
    // Goes up with every change, so a running workflow can say which one it was copied from.
    version: integer("version").notNull().default(1),
    // The starter it was added from, which is then no longer offered.
    starterKey: text("starter_key"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("workflow_templates_owner_name_idx").on(
      table.ownerId,
      table.name,
    ),
  ],
);

export const workflowTemplateStages = pgTable(
  "workflow_template_stages",
  {
    id: id(),
    ownerId: ownerId(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    kind: text("kind").$type<StageKind>().notNull().default("normal"),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    defaultTasks: jsonb("default_tasks")
      .$type<StageTask[]>()
      .notNull()
      .default([]),
    slaDays: integer("sla_days"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("workflow_template_stages_kind_check", oneOf(table.kind, STAGE_KINDS)),
    check(
      "workflow_template_stages_sla_days_check",
      sql`${table.slaDays} is null or ${table.slaDays} > 0`,
    ),
    index("workflow_template_stages_template_idx").on(
      table.templateId,
      table.position,
    ),
  ],
);

// The stages a stage leads to. The list editor works them out from the order
// of the stages; they are stored so that a move only ever has to look one up.
export const workflowTemplateEdges = pgTable(
  "workflow_template_edges",
  {
    ownerId: ownerId(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id")
      .notNull()
      .references(() => workflowTemplateStages.id, { onDelete: "cascade" }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => workflowTemplateStages.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.fromStageId, table.toStageId] }),
    index("workflow_template_edges_template_idx").on(table.templateId),
  ],
);
