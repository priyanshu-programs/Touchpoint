import { z } from "zod";

// The icons a workflow can be marked with, in the order the picker shows them.
// Only these keys are stored; each is drawn from a fixed map in the app.
export const WORKFLOW_ICONS = [
  "briefcase",
  "handshake",
  "rocket",
  "target",
  "megaphone",
  "pen-tool",
  "palette",
  "code",
  "camera",
  "mic",
  "file-text",
  "book-open",
  "mail",
  "phone",
  "calendar",
  "users",
  "graduation-cap",
  "scale",
  "chart-column",
  "dollar-sign",
  "package",
  "truck",
  "house",
  "wrench",
  "lightbulb",
  "compass",
  "globe",
  "shield",
  "zap",
  "heart",
  "star",
  "flag",
  "trophy",
  "coffee",
] as const;
export type WorkflowIcon = (typeof WORKFLOW_ICONS)[number];

export const workflowIcon = z.enum(WORKFLOW_ICONS);

export const isWorkflowIcon = (value: string | null): value is WorkflowIcon =>
  workflowIcon.safeParse(value).success;
