import type { Metadata } from "next";
import { requireOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { priorityColors } from "@/modules/settings/priority-colors";
import { getSettings } from "@/modules/settings/service";
import { listDueTasks } from "@/modules/tasks/queries";
import { DueToday } from "../due-today";

export const metadata: Metadata = { title: "Tasks today" };

export default async function TasksTodayPage() {
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);
  const timezone = settings?.timezone ?? "UTC";
  const tasks = await listDueTasks(owner.id, {
    through: dateIn(timezone),
    hideSnoozed: true,
  });

  return (
    <DueToday
      tasks={tasks}
      timezone={timezone}
      colors={priorityColors(settings)}
    />
  );
}
