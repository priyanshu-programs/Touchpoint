import type { Metadata } from "next";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn } from "@/lib/time";
import { getSettings } from "@/modules/settings/service";
import { listDueTasks } from "@/modules/tasks/queries";
import { WeekAhead } from "../../week-ahead";

export const metadata: Metadata = { title: "Tasks this week" };

export default async function TasksWeekPage() {
  const owner = await requireOwner();
  const timezone = (await getSettings(owner.id))?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const tasks = await listDueTasks(owner.id, {
    from: today,
    through: addDays(today, 6),
  });

  return (
    <WeekAhead
      tasks={tasks}
      timezone={timezone}
      empty="Nothing is due in the next seven days."
    />
  );
}
