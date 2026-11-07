import type { PriorityColors } from "@/modules/settings/priority-colors";
import { createTaskAction } from "./actions";
import { taskFormOptions } from "./form-options";
import { TaskForm } from "./task-form";

// The form that adds a task, on its own page or in the panel of the record it is for.
export function NewTask({
  contact,
  organization,
  timezone,
  colors,
  inside,
  cancelHref,
  due,
  time,
}: {
  // A day, and maybe an hour, picked on the calendar.
  due?: string;
  time?: string;
  contact: {
    id: string;
    fullName: string;
    companies: { id: string; name: string }[];
  } | null;
  organization: { id: string; name: string } | null;
  timezone: string;
  colors: PriorityColors;
  inside?: string;
  cancelHref: string;
}) {
  const only = contact?.companies.length === 1 ? contact.companies[0] : null;

  return (
    <TaskForm
      action={createTaskAction}
      initial={{
        title: "",
        notes: "",
        priority: "normal",
        dueDate: due ?? "",
        dueTime: time ?? "",
        repeat: "",
        repeatEvery: "1",
        remindAt: "",
        contactId: contact?.id ?? "",
        contactName: contact?.fullName ?? "",
        // A task for a person is also about their organization, when they have just the one.
        organizationId: (organization ?? only)?.id ?? "",
        organizationName: (organization ?? only)?.name ?? "",
      }}
      options={taskFormOptions}
      colors={colors}
      timezone={timezone}
      from={contact ? "contact" : organization ? "organization" : undefined}
      inside={inside}
      back={due ? "calendar" : undefined}
      submitLabel="Add task"
      cancelHref={cancelHref}
    />
  );
}
