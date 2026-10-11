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
import { addDays, dateIn, formatDateTime } from "@/lib/time";
import { listTimeline } from "@/modules/activities/queries";
import { countContacts } from "@/modules/contacts/queries";
import { countOrganizations } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import {
  listDeliveredReminders,
  listDueTasks,
} from "@/modules/tasks/queries";
import { TimelineEvent } from "./activities/timeline-event";
import { dismissReminderAction } from "./tasks/actions";
import { DueToday } from "./tasks/due-today";
import { WeekAhead } from "./tasks/week-ahead";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const owner = await requireOwner();
  const timezone = (await getSettings(owner.id))?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const [tasks, reminders, upcoming, recent, contactCount, organizationCount] =
    await Promise.all([
      listDueTasks(owner.id, { through: today, hideSnoozed: true }),
      listDeliveredReminders(owner.id),
      listDueTasks(owner.id, {
        from: addDays(today, 1),
        through: addDays(today, 6),
      }),
      listTimeline(owner.id, { limit: 5 }),
      countContacts(owner.id),
      countOrganizations(owner.id),
    ]);
  const people = [
    { href: "/people/contacts", label: "Contacts", count: contactCount },
    {
      href: "/people/organizations",
      label: "Organizations",
      count: organizationCount,
    },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-muted-foreground">Welcome, {owner.name}.</p>
      </div>

      <ul className="grid grid-cols-2 gap-4 lg:gap-6">
        {people.map((tile) => (
          <li key={tile.href}>
            <Link
              href={tile.href}
              className="grid gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:bg-accent"
            >
              <span className="text-sm text-muted-foreground">{tile.label}</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {tile.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>

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
        <CardContent>
          <DueToday tasks={tasks} timezone={timezone} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <CardAction>
              <ButtonLink href="/tasks/week" variant="outline" size="sm">
                Week
              </ButtonLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            <WeekAhead
              tasks={upcoming}
              timezone={timezone}
              empty="Nothing else is due in the next seven days."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardAction>
              <ButtonLink href="/activities/new" variant="outline" size="sm">
                Log activity
              </ButtonLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recent.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-4">
                {recent.rows.map((event) => (
                  <li key={event.eventId} className="grid min-w-0 gap-1">
                    <TimelineEvent
                      event={event}
                      when={formatDateTime(event.occurredAt, timezone)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
