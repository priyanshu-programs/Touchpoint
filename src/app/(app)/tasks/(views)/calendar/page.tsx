import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ButtonLink } from "@/components/button-link";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn, formatDate, startOfWeek } from "@/lib/time";
import { meetingsBetween } from "@/modules/integrations/meetings";
import { schedulingState } from "@/modules/integrations/scheduling";
import { googleConnection } from "@/modules/integrations/service";
import { getSettings } from "@/modules/settings/service";
import { listDueTasks } from "@/modules/tasks/queries";
import { monthRange, nextMonth, previousMonth } from "../../calendar-entries";
import { CalendarMonth } from "../../calendar-month";
import { CalendarWeek } from "../../calendar-week";

export const metadata: Metadata = { title: "Calendar" };

const LISTED = 200;
const SYNCED_DAYS_AHEAD = 90;

// Bounded so that moving a week or month from here always stays a date the database accepts.
const day = z.iso
  .date()
  .refine((date) => date >= "2000-01-01" && date <= "2100-12-31")
  .optional()
  .catch(undefined);

const params = z.object({
  view: z.enum(["month", "week"]).optional().catch(undefined),
  on: day,
  // The address the week-only calendar used, kept so old links still open that week.
  week: day,
});

const monthName = (first: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${first}T00:00:00Z`),
  );

const calendarHref = (view: "month" | "week", on?: string) =>
  `/tasks/calendar?view=${view}${on ? `&on=${on}` : ""}`;

export default async function TasksCalendarPage({
  searchParams,
}: PageProps<"/tasks/calendar">) {
  const owner = await requireOwner();
  const query = params.parse(await searchParams);
  const view = query.week ? "week" : (query.view ?? "month");
  const settings = await getSettings(owner.id);
  const timezone = settings?.timezone ?? "UTC";
  const weekStart = settings?.weekStart ?? 1;
  const today = dateIn(timezone);
  const on = query.week ?? query.on ?? today;

  const month = monthRange(on, weekStart);
  const start = view === "month" ? month.start : startOfWeek(on, weekStart);
  const through = view === "month" ? month.through : addDays(start, 6);
  const [previous, next] =
    view === "month"
      ? [previousMonth(month.first), nextMonth(month.first)]
      : [addDays(start, -7), addDays(start, 7)];

  const [tasks, google, meetings, scheduling] = await Promise.all([
    listDueTasks(owner.id, { from: start, through }),
    googleConnection(owner.id),
    meetingsBetween(owner.id, start, through, timezone, LISTED),
    schedulingState(owner.id),
  ]);
  const connected = google && google.status !== "revoked";
  const shown = connected ? meetings : [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {view === "month"
            ? monthName(month.first)
            : `${formatDate(start)} to ${formatDate(through)}`}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="View" className="flex rounded-md border p-0.5">
            {(["month", "week"] as const).map((name) => (
              <ButtonLink
                key={name}
                href={calendarHref(name, on)}
                variant={view === name ? "secondary" : "ghost"}
                size="sm"
                aria-current={view === name ? "page" : undefined}
              >
                {name === "month" ? "Month" : "Week"}
              </ButtonLink>
            ))}
          </nav>
          <nav aria-label={view === "month" ? "Month" : "Week"} className="flex gap-2">
            <ButtonLink href={calendarHref(view, previous)} variant="outline" size="sm">
              Previous
            </ButtonLink>
            <ButtonLink href={calendarHref(view)} variant="outline" size="sm">
              Today
            </ButtonLink>
            <ButtonLink href={calendarHref(view, next)} variant="outline" size="sm">
              Next
            </ButtonLink>
          </nav>
          {scheduling !== "off" && (
            <ButtonLink href="/meetings/new" variant="outline" size="sm">
              Schedule meeting
            </ButtonLink>
          )}
        </div>
      </div>

      {view === "month" ? (
        <CalendarMonth
          first={month.first}
          start={start}
          through={through}
          selected={on}
          today={today}
          timezone={timezone}
          tasks={tasks}
          meetings={shown}
        />
      ) : (
        <CalendarWeek
          start={start}
          today={today}
          timezone={timezone}
          tasks={tasks}
          meetings={shown}
        />
      )}

      {(tasks.length === LISTED || meetings.length === LISTED) && (
        <p className="text-sm text-muted-foreground">
          Showing the first {LISTED} tasks and the first {LISTED} meetings of this {view}.
        </p>
      )}
      {!connected && (
        <p className="text-sm text-muted-foreground">
          <Link href="/settings/integrations" className="underline">
            Connect Google Calendar
          </Link>{" "}
          to see your meetings here.
        </p>
      )}
      {connected && through > addDays(today, SYNCED_DAYS_AHEAD) && (
        <p className="text-sm text-muted-foreground">
          Meetings are copied from Google up to {SYNCED_DAYS_AHEAD} days ahead.
        </p>
      )}
    </div>
  );
}
