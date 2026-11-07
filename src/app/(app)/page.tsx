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
import { callName } from "@/lib/greeting";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn, formatDateTime } from "@/lib/time";
import { listTimeline } from "@/modules/activities/queries";
import { meetingsBetween } from "@/modules/integrations/meetings";
import { googleConnection } from "@/modules/integrations/service";
import { MeetingsCard } from "./meetings/meetings-card";
import { countContacts } from "@/modules/contacts/queries";
import { countOrganizations } from "@/modules/organizations/queries";
import { periodRange } from "@/modules/revenue/period";
import { hasMoney, revenueSummary, type CurrencyAmount } from "@/modules/revenue/queries";
import { priorityColors } from "@/modules/settings/priority-colors";
import { getSettings } from "@/modules/settings/service";
import {
  listDeliveredReminders,
  listDueTasks,
} from "@/modules/tasks/queries";
import { TimelineEvent } from "./activities/timeline-event";
import { ConnectCalendarCard } from "./connect-calendar-card";
import { figureLinks } from "./money/figure-links";
import { MoneyChartCard } from "./money-chart-card";
import { nextUp, todaySummary } from "./next-up";
import { NextUpCard } from "./next-up-card";
import { QuickActions } from "./quick-actions";
import { dismissReminderAction } from "./tasks/actions";
import { DueToday } from "./tasks/due-today";
import { WeekAhead } from "./tasks/week-ahead";
import { TodayTiles } from "./today-tiles";

export const metadata: Metadata = { title: "Today" };

// This month's money in the base currency, with what came in other currencies said after
// it; each tile opens the rows it adds up.
async function moneyTiles(ownerId: string, today: string, base: string) {
  if (!(await hasMoney(ownerId))) return null;
  const range = periodRange("this-month", today);
  const { received, invoiced, outstanding } = await revenueSummary(ownerId, {
    range,
    today,
    baseCurrency: base,
  });
  const links = figureLinks(range);
  const inBase = (amounts: CurrencyAmount[]) =>
    amounts.find(({ currency }) => currency === base)?.minor ?? 0;
  const others = (amounts: CurrencyAmount[]) => {
    const rest = amounts.filter(({ currency }) => currency !== base);
    return rest.length > 0
      ? `and ${rest.map(({ minor, currency }) => formatMoney(minor, currency)).join(", ")}`
      : null;
  };
  return [
    {
      label: "Received this month",
      href: links.received(),
      figure: formatMoney(received.minor, base),
      more: null,
    },
    {
      label: "Invoiced this month",
      href: links.invoiced(base),
      figure: formatMoney(inBase(invoiced), base),
      more: others(invoiced),
    },
    {
      label: "Outstanding today",
      href: links.outstanding(base),
      figure: formatMoney(inBase(outstanding), base),
      more: others(outstanding),
    },
  ];
}

export default async function TodayPage() {
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);
  const timezone = settings?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const base = settings?.baseCurrency ?? "INR";
  const [
    tasks,
    reminders,
    upcoming,
    recent,
    contactCount,
    organizationCount,
    money,
    google,
    calendar,
  ] = await Promise.all([
    listDueTasks(owner.id, { through: today, hideSnoozed: true }),
    listDeliveredReminders(owner.id),
    listDueTasks(owner.id, {
      from: addDays(today, 1),
      through: addDays(today, 6),
    }),
    listTimeline(owner.id, { limit: 5, withoutMeetings: true }),
    countContacts(owner.id),
    countOrganizations(owner.id),
    moneyTiles(owner.id, today, base),
    googleConnection(owner.id),
    meetingsBetween(owner.id, today, addDays(today, 6), timezone),
  ]);
  const connected = google && google.status !== "revoked";
  // A copy of the calendar can outlast its connection, and is then not shown.
  const meetings = connected ? calendar : [];
  const day = { today, now: new Date(), timezone };
  const people = [
    { href: "/people/contacts", label: "Contacts", count: contactCount },
    {
      href: "/people/organizations",
      label: "Companies",
      count: organizationCount,
    },
  ];
  const longDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));

  return (
    // Laid out by its own width, not the screen's, since the sidebar can be dragged wider.
    // When narrow the two columns' wrappers step aside and every card takes its place by
    // its own order, so the work comes first on a phone with each card drawn once.
    <div className="@container relative isolate grid gap-6">
      <div
        aria-hidden
        className="today-wash pointer-events-none absolute -top-24 -left-16 -z-10 h-96 w-4/5 @4xl:w-2/3"
      />
      <div className="grid gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
          <p className="text-muted-foreground">{longDate}</p>
        </div>
        <p className="text-muted-foreground">
          Welcome, {callName(owner.name, settings?.preferredName)}.{" "}
          {todaySummary({ due: tasks, meetings }, day)}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:grid-rows-[auto_1fr]">
        <div className="grid content-start gap-4 @max-4xl:contents @4xl:col-start-2 @4xl:row-start-1">
          <div className="@max-4xl:order-1">
            <NextUpCard next={nextUp({ due: tasks, upcoming, meetings }, day)} />
          </div>
          <div className="@max-4xl:order-2">
            <QuickActions />
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4 @max-4xl:contents @4xl:col-start-1 @4xl:row-span-2 @4xl:row-start-1">
          <div className="@max-4xl:order-7">
            <TodayTiles money={money} people={people} />
          </div>

          {money && (
            <div className="@max-4xl:order-8">
              <MoneyChartCard ownerId={owner.id} today={today} base={base} />
            </div>
          )}

          {reminders.length > 0 && (
            <Card className="@max-4xl:order-3">
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

          <Card className="@max-4xl:order-4">
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <DueToday
                tasks={tasks}
                timezone={timezone}
                colors={priorityColors(settings)}
              />
            </CardContent>
          </Card>

          <Card className="@max-4xl:order-9">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
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

        <div className="grid content-start gap-4 @max-4xl:contents @4xl:col-start-2 @4xl:row-start-2">
          <div className="@max-4xl:order-5">
            {connected ? (
              <MeetingsCard meetings={meetings} today={today} timezone={timezone} />
            ) : (
              <ConnectCalendarCard />
            )}
          </div>

          <Card className="@max-4xl:order-6">
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
                colors={priorityColors(settings)}
                empty="Nothing else is due in the next seven days."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
