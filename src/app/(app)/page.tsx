import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { dateIn, formatDateTime } from "@/lib/time";
import { getSettings } from "@/modules/settings/service";
import {
  listDeliveredReminders,
  listDueTasks,
} from "@/modules/tasks/queries";
import { dismissReminderAction } from "./tasks/actions";
import { DueToday } from "./tasks/due-today";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const owner = await requireOwner();
  const timezone = (await getSettings(owner.id))?.timezone ?? "UTC";
  const [tasks, reminders] = await Promise.all([
    listDueTasks(owner.id, timezone, {
      through: dateIn(timezone),
      hideSnoozed: true,
    }),
    listDeliveredReminders(owner.id),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-muted-foreground">Welcome, {owner.name}.</p>
      </div>

      {reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {reminders.map((reminder) => (
                <li key={reminder.id} className="flex items-start gap-3">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <Link
                      href={`/tasks/${reminder.taskId}`}
                      className="font-medium break-words underline-offset-4 hover:underline"
                    >
                      {reminder.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Reminder for {formatDateTime(reminder.remindAt, timezone)}
                    </p>
                  </div>
                  <form action={dismissReminderAction}>
                    <input type="hidden" name="id" value={reminder.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Dismiss reminder: ${reminder.title}`}
                    >
                      Dismiss
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardAction>
            <ButtonLink href="/tasks/new" variant="outline" size="sm">
              Add task
            </ButtonLink>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <DueToday tasks={tasks} timezone={timezone} />
          <Link href="/tasks/week" className="justify-self-start text-sm underline">
            The week ahead
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
