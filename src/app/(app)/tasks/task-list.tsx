import { Check } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dateIn, formatDate, formatDateTime, isFuture } from "@/lib/time";
import type { TaskListRow } from "@/modules/tasks/queries";
import {
  completeTaskAction,
  reopenTaskAction,
  snoozeTaskAction,
} from "./actions";
import { repeatLabel } from "./form-options";

function dueLabel(task: TaskListRow, timezone: string, today: string) {
  if (task.dueAt) return formatDateTime(task.dueAt, timezone);
  if (!task.dueOn) return null;
  return task.dueOn === today ? "Today" : formatDate(task.dueOn);
}

export function TaskList({
  tasks,
  timezone,
  snooze = false,
}: {
  tasks: TaskListRow[];
  timezone: string;
  // Offered where the list is about today, so a task can be pushed to tomorrow in one click.
  snooze?: boolean;
}) {
  const today = dateIn(timezone);

  return (
    <ul className="grid gap-3">
      {tasks.map((task) => {
        const open = task.status === "open";
        const dueDate =
          task.dueOn ?? (task.dueAt ? dateIn(timezone, task.dueAt) : null);
        const overdue = open && dueDate !== null && dueDate < today;
        const due = dueLabel(task, timezone, today);
        const snoozed = task.snoozedUntil && isFuture(task.snoozedUntil);

        return (
          <li key={task.id} className="flex items-start gap-3">
            {open ? (
              <form action={completeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Complete: ${task.title}`}
                >
                  <Check aria-hidden />
                </Button>
              </form>
            ) : (
              <form action={reopenTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label={`Reopen: ${task.title}`}
                >
                  Reopen
                </Button>
              </form>
            )}

            <div className="grid min-w-0 flex-1 gap-0.5">
              <Link
                href={`/tasks/${task.id}`}
                className="font-medium break-words underline-offset-4 hover:underline"
              >
                {task.title}
              </Link>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {due && (
                  <span className={overdue ? "text-destructive" : undefined}>
                    {overdue ? `Overdue: ${due}` : due}
                  </span>
                )}
                {task.priority === "high" && <Badge>High</Badge>}
                {task.recurrenceRule && (
                  <span>{repeatLabel(task.recurrenceRule)}</span>
                )}
                {snoozed && (
                  <span>
                    Snoozed until {formatDateTime(task.snoozedUntil!, timezone)}
                  </span>
                )}
                {task.completedAt && (
                  <span>Done {formatDateTime(task.completedAt, timezone)}</span>
                )}
                {task.contactId && (
                  <Link
                    href={`/people/contacts/${task.contactId}`}
                    className="underline"
                  >
                    {task.contactName}
                  </Link>
                )}
                {task.organizationId && (
                  <Link
                    href={`/people/organizations/${task.organizationId}`}
                    className="underline"
                  >
                    {task.organizationName}
                  </Link>
                )}
              </p>
            </div>

            {snooze && open && (
              <form action={snoozeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="days" value="1" />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label={`Snooze until tomorrow: ${task.title}`}
                  title="Hide until tomorrow"
                >
                  Snooze
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
