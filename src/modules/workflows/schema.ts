import { z } from "zod";
import { STAGE_KINDS, TASK_PRIORITIES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";

export { STAGE_KINDS };

export const MAX_TEMPLATES = 50;
export const MAX_STAGES = 30;
export const MAX_CHECKLIST_ITEMS = 30;
export const MAX_STAGE_TASKS = 10;

export const templateInput = z.strictObject({
  name: z.string().trim().min(1, "Give the workflow a name").max(80),
  description: blankToNull(text(1000)),
});
export type TemplateInput = z.infer<typeof templateInput>;

// Numbers arrive as the owner typed them.
const days = (max: number, message: string) =>
  z.coerce.number(message).int(message).max(max, message);

const checklistItem = z.strictObject({
  // Kept when the item was already there, so a later edit does not make it a new one.
  id: z.uuid().optional(),
  label: z.string().trim().min(1, "Give every checklist item a name").max(200),
  required: z.boolean(),
});

const stageTask = z.strictObject({
  title: z.string().trim().min(1, "Give every task a title").max(300),
  offsetDays: days(365, "Enter when a task is due as 0 to 365 days").min(
    0,
    "Enter when a task is due as 0 to 365 days",
  ),
  priority: z.enum(TASK_PRIORITIES),
});

export const stageInput = z
  .strictObject({
    name: z.string().trim().min(1, "Give the stage a name").max(80),
    description: blankToNull(text(2000)),
    kind: z.enum(STAGE_KINDS),
    slaDays: blankToNull(
      days(365, "Enter the deadline as 1 to 365 days").min(
        1,
        "Enter the deadline as 1 to 365 days",
      ),
    ),
    checklist: z
      .array(checklistItem)
      .max(
        MAX_CHECKLIST_ITEMS,
        `A stage has at most ${MAX_CHECKLIST_ITEMS} checklist items`,
      ),
    defaultTasks: z
      .array(stageTask)
      .max(MAX_STAGE_TASKS, `A stage creates at most ${MAX_STAGE_TASKS} tasks`),
  })
  // Nothing leads on from an end stage, so there is nothing to tick before leaving it
  // and no time to leave it by.
  .refine(
    (stage) =>
      stage.kind === "normal" ||
      (stage.slaDays === null && stage.checklist.length === 0),
    { message: "A stage that ends the workflow has no deadline or checklist" },
  );
export type StageInput = z.infer<typeof stageInput>;

export const stageOrder = z.array(z.uuid()).min(1).max(MAX_STAGES);
