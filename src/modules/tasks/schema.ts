import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { FREQUENCIES } from "./recurrence";

export { TASK_PRIORITIES, TASK_STATUSES };

// Dates and times arrive as the owner typed them; the service turns them into instants
// using the owner's time zone.
export const taskInput = z
  .strictObject({
    title: z.string().trim().min(1, "Enter what needs doing").max(300),
    notes: blankToNull(text(5000)),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: blankToNull(z.iso.date("Enter a valid due date")),
    dueTime: blankToNull(
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid due time"),
    ),
    repeat: blankToNull(z.enum(FREQUENCIES)),
    repeatEvery: z.coerce
      .number("Enter how often the task repeats")
      .int()
      .min(1, "A task repeats at least every 1")
      .max(99),
    remindAt: blankToNull(
      z.iso.datetime({
        local: true,
        precision: -1,
        error: "Enter a valid reminder time",
      }),
    ),
    contactId: blankToNull(z.uuid()),
    organizationId: blankToNull(z.uuid()),
  })
  .refine((value) => !value.dueTime || value.dueDate, {
    message: "Choose a due date to go with the time",
  })
  .refine((value) => !value.repeat || value.dueDate, {
    message: "A repeating task needs a due date",
  });

export type TaskInput = z.infer<typeof taskInput>;
