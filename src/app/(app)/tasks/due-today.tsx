import { dateIn } from "@/lib/time";
import type { TaskListRow } from "@/modules/tasks/queries";
import { TaskList } from "./task-list";

// Overdue and due-today tasks, as shown on both the Today dashboard and the Tasks screen.
export function DueToday({
  tasks,
  timezone,
}: {
  tasks: TaskListRow[];
  timezone: string;
}) {
  const today = dateIn(timezone);
  const isOverdue = (task: TaskListRow) => task.dueOn! < today;
  const overdue = tasks.filter(isOverdue);
  const dueToday = tasks.filter((task) => !isOverdue(task));

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing is due today.</p>
    );
  }
  return (
    <div className="grid gap-6">
      {overdue.length > 0 && (
        <section aria-labelledby="overdue-heading" className="grid gap-3">
          <h2 id="overdue-heading" className="font-medium">
            Overdue ({overdue.length})
          </h2>
          <TaskList tasks={overdue} timezone={timezone} snooze />
        </section>
      )}
      {dueToday.length > 0 && (
        <section aria-labelledby="due-today-heading" className="grid gap-3">
          <h2 id="due-today-heading" className="font-medium">
            Due today ({dueToday.length})
          </h2>
          <TaskList tasks={dueToday} timezone={timezone} snooze />
        </section>
      )}
      {tasks.length === 200 && (
        <p className="text-sm text-muted-foreground">
          Showing the first 200 tasks. The rest are under All.
        </p>
      )}
    </div>
  );
}
