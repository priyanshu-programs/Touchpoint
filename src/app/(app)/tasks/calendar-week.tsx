import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import { addDays, dateIn, formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";

type Entry = {
  href: string;
  title: string;
  time?: string;
  meeting: boolean;
  // All-day meetings, then tasks without a time, then the rest by the clock.
  order: number;
};

const ALL_DAY = -2;
const NO_TIME = -1;

function entriesOn(
  date: string,
  tasks: TaskListRow[],
  meetings: ListedMeeting[],
  timezone: string,
): Entry[] {
  const fromTasks = tasks
    .filter((task) => task.dueOn === date)
    .map((task) => ({
      href: `/tasks/${task.id}`,
      title: task.title,
      time: task.dueAt ? formatTime(task.dueAt, timezone) : undefined,
      meeting: false,
      order: task.dueAt?.getTime() ?? NO_TIME,
    }));
  const fromMeetings = meetings
    .filter((meeting) =>
      meeting.allDay
        ? meeting.startsOn! <= date && date < meeting.endsOn!
        : dateIn(timezone, meeting.startsAt!) === date,
    )
    .map((meeting) => ({
      href: `/meetings/${meeting.id}`,
      title: meeting.title,
      time: meeting.allDay ? "All day" : formatTime(meeting.startsAt!, timezone),
      meeting: true,
      order: meeting.startsAt?.getTime() ?? ALL_DAY,
    }));
  return [...fromMeetings, ...fromTasks].toSorted((a, b) => a.order - b.order);
}

// A week of open tasks and meetings by the owner's days: side by side on a wide screen, and
// on a phone a list of the days that have something.
export function CalendarWeek({
  start,
  today,
  timezone,
  tasks,
  meetings,
  cut,
}: {
  start: string;
  today: string;
  timezone: string;
  tasks: TaskListRow[];
  meetings: ListedMeeting[];
  cut: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    return { date, entries: entriesOn(date, tasks, meetings, timezone) };
  });
  const weekOf = (date: string) => `/tasks/calendar?week=${date}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {formatDate(start)} to {formatDate(days[6].date)}
        </h2>
        <nav aria-label="Week" className="flex gap-2">
          <ButtonLink href={weekOf(addDays(start, -7))} variant="outline" size="sm">
            Previous
          </ButtonLink>
          <ButtonLink href="/tasks/calendar" variant="outline" size="sm">
            This week
          </ButtonLink>
          <ButtonLink href={weekOf(addDays(start, 7))} variant="outline" size="sm">
            Next
          </ButtonLink>
        </nav>
      </div>

      {days.every((day) => day.entries.length === 0) && (
        <p className="text-sm text-muted-foreground">Nothing this week.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-7 lg:gap-2">
        {days.map((day) => (
          <section
            key={day.date}
            aria-label={formatDate(day.date)}
            aria-current={day.date === today ? "date" : undefined}
            className={cn(
              "content-start gap-2 rounded-md lg:grid lg:min-h-32 lg:border lg:p-2",
              day.entries.length === 0 ? "hidden" : "grid",
              day.date === today && "lg:border-foreground",
            )}
          >
            <h3 className="text-sm font-medium break-words">
              {day.date === today ? `Today, ${formatDate(day.date)}` : formatDate(day.date)}
            </h3>
            {day.entries.length > 0 && (
              <ul className="grid min-w-0 gap-2">
                {day.entries.map((entry) => (
                  <li
                    key={entry.href}
                    className="grid min-w-0 gap-1 rounded-md bg-card p-2 text-sm ring-1 ring-foreground/10"
                  >
                    {(entry.time || entry.meeting) && (
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        {entry.time}
                        {entry.meeting && <Badge variant="outline">Meeting</Badge>}
                      </span>
                    )}
                    <Link
                      href={entry.href}
                      className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
                    >
                      {entry.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {cut && (
        <p className="text-sm text-muted-foreground">
          Showing the first 200 tasks and the first 200 meetings of this week.
        </p>
      )}
    </div>
  );
}
