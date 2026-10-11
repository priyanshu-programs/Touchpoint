import type { Metadata } from "next";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn, formatDate } from "@/lib/time";
import { getSettings } from "@/modules/settings/service";
import { listDueTasks } from "@/modules/tasks/queries";
import { TaskList } from "../../task-list";

export const metadata: Metadata = { title: "Tasks this week" };

export default async function TasksWeekPage() {
  const owner = await requireOwner();
  const timezone = (await getSettings(owner.id))?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const tasks = await listDueTasks(owner.id, {
    from: today,
    through: addDays(today, 6),
  });

  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset);
    return {
      date,
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : formatDate(date),
      tasks: tasks.filter((task) => task.dueOn === date),
    };
  }).filter((day) => day.tasks.length > 0);

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is due in the next seven days.
      </p>
    );
  }
  return (
    <div className="grid gap-6">
      {days.map((day) => (
        <section key={day.date} className="grid gap-3">
          <h2 className="font-medium">{day.label}</h2>
          <TaskList tasks={day.tasks} timezone={timezone} />
        </section>
      ))}
    </div>
  );
}
