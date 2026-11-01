import Link from "next/link";
import type { ReactNode } from "react";
import { DetailList } from "@/components/detail-list";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { formatDate, formatDateTime, isFuture, toLocalInput } from "@/lib/time";
import type { getTask } from "@/modules/tasks/queries";
import { parseRule } from "@/modules/tasks/recurrence";
import {
  cancelTaskAction,
  completeTaskAction,
  reopenTaskAction,
  snoozeTaskAction,
  updateTaskAction,
} from "./actions";
import { repeatLabel, taskFormOptions } from "./form-options";
import { TaskForm } from "./task-form";

const SNOOZES = [
  { days: "1", label: "Tomorrow" },
  { days: "3", label: "In 3 days" },
  { days: "7", label: "In a week" },
];
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  done: "Done",
  cancelled: "Cancelled",
};

// One task: where it stands, what can be done with it, and its details. Shown on its
// own page and in the panel of a record it belongs to.
export function TaskEditor({
  task,
  timezone,
  cancelHref,
  heading,
}: {
  task: NonNullable<Awaited<ReturnType<typeof getTask>>>;
  timezone: string;
  cancelHref: string;
  // The title, where the panel has not already given it.
  heading?: ReactNode;
}) {
  const open = task.status === "open";
  const dueLocal = task.dueAt ? toLocalInput(task.dueAt, timezone) : null;
  const rule = task.recurrenceRule ? parseRule(task.recurrenceRule) : null;
  const snoozed = task.snoozedUntil && isFuture(task.snoozedUntil);
  const reminder = task.reminder;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {heading}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={open ? "secondary" : "outline"}>
              {STATUS_LABELS[task.status]}
            </Badge>
            {task.completedAt && (
              <span>Completed {formatDateTime(task.completedAt, timezone)}</span>
            )}
            {snoozed && (
              <span>
                Snoozed until {formatDateTime(task.snoozedUntil!, timezone)}
              </span>
            )}
            {reminder?.status === "sent" && (
              <span>
                Reminder sent {formatDateTime(reminder.sentAt!, timezone)}
              </span>
            )}
            {reminder?.status === "scheduled" && (
              <span>
                {isFuture(reminder.remindAt)
                  ? `Reminder scheduled for ${formatDateTime(reminder.remindAt, timezone)}`
                  : "Reminder is due and will appear on Today when the scheduler next runs"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <form action={completeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button type="submit">Complete</Button>
              </form>
              <form action={cancelTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button type="submit" variant="outline">
                  Cancel task
                </Button>
              </form>
            </>
          ) : (
            <form action={reopenTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <Button type="submit" variant="outline">
                Reopen
              </Button>
            </form>
          )}
        </div>
      </div>

      {open ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskForm
                action={updateTaskAction.bind(null, task.id)}
                initial={{
                  title: task.title,
                  notes: task.notes ?? "",
                  priority: task.priority,
                  dueDate: task.dueOn ?? "",
                  dueTime: dueLocal?.slice(11) ?? "",
                  repeat: rule?.frequency ?? "",
                  repeatEvery: String(rule?.interval ?? 1),
                  remindAt:
                    reminder?.status === "scheduled"
                      ? toLocalInput(reminder.remindAt, timezone)
                      : "",
                  contactId: task.contactId ?? "",
                  contactName: task.contactName ?? "",
                  organizationId: task.organizationId ?? "",
                  organizationName: task.organizationName ?? "",
                }}
                options={taskFormOptions}
                timezone={timezone}
                submitLabel="Save changes"
                cancelHref={cancelHref}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Snooze</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {SNOOZES.map((snooze) => (
                <form key={snooze.days} action={snoozeTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="days" value={snooze.days} />
                  <Button type="submit" variant="outline">
                    {snooze.label}
                  </Button>
                </form>
              ))}
              {snoozed && (
                <form action={snoozeTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="days" value="" />
                  <Button type="submit" variant="ghost">
                    Stop snoozing
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                {
                  label: "Due",
                  value: task.dueAt
                    ? formatDateTime(task.dueAt, timezone)
                    : task.dueOn && formatDate(task.dueOn),
                },
                {
                  label: "Repeats",
                  value: task.recurrenceRule && repeatLabel(task.recurrenceRule),
                },
                {
                  label: "Contact",
                  value: task.contactId && (
                    <Link
                      href={contactHref(task.contactId)}
                      className="underline"
                    >
                      {task.contactName}
                    </Link>
                  ),
                },
                {
                  label: "Company",
                  value: task.organizationId && (
                    <Link
                      href={companyHref(task.organizationId)}
                      className="underline"
                    >
                      {task.organizationName}
                    </Link>
                  ),
                },
                {
                  label: "Notes",
                  value: task.notes && (
                    <span className="whitespace-pre-wrap">
                      <LinkedText text={task.notes} />
                    </span>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
