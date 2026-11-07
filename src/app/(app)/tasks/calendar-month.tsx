import Link from "next/link";
import { addDays, daysBetween, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";
import { entriesOn } from "./calendar-entries";
import { addTaskHref, DayAgenda, EntryChip } from "./calendar-parts";

const SHOWN = 3;

const weekday = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

// A month as a grid of weeks. On a wide screen each day shows its first entries and an
// empty part of it adds a task on that day; on a phone a day shows dots and opens below.
export function CalendarMonth({
  first,
  start,
  through,
  selected,
  today,
  timezone,
  tasks,
  meetings,
}: {
  first: string;
  start: string;
  through: string;
  selected: string;
  today: string;
  timezone: string;
  tasks: TaskListRow[];
  meetings: ListedMeeting[];
}) {
  const month = first.slice(0, 7);
  const days = Array.from({ length: daysBetween(start, through) + 1 }, (_, offset) => {
    const date = addDays(start, offset);
    return { date, entries: entriesOn(date, tasks, meetings, timezone) };
  });
  const open =
    days.find((day) => day.date === selected) ??
    days.find((day) => day.date === today && day.date.startsWith(month)) ??
    days.find((day) => day.date === first)!;

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {days.slice(0, 7).map((day) => (
            <div key={day.date} className="py-2">
              {weekday(day.date)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const inMonth = day.date.startsWith(month);
            const extra = day.entries.length - SHOWN;
            return (
              <section
                key={day.date}
                aria-label={formatDate(day.date)}
                aria-current={day.date === today ? "date" : undefined}
                className={cn(
                  "relative flex min-h-14 min-w-0 flex-col gap-1 p-1 sm:min-h-28",
                  index % 7 !== 0 && "border-l",
                  index >= 7 && "border-t",
                  !inMonth && "bg-muted/30",
                  day.date === open.date && "max-sm:bg-accent",
                )}
              >
                <Link
                  href={addTaskHref(day.date)}
                  aria-label={`Add task on ${formatDate(day.date)}`}
                  className="absolute inset-0 hidden hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none sm:block"
                />
                <Link
                  href={`/tasks/calendar?view=month&on=${day.date}`}
                  aria-label={`Show ${formatDate(day.date)}`}
                  className="absolute inset-0 sm:hidden"
                />
                <span
                  className={cn(
                    "pointer-events-none relative grid size-6 place-items-center self-center rounded-full text-xs tabular-nums sm:self-start",
                    !inMonth && "text-muted-foreground",
                    day.date === today && "bg-foreground font-semibold text-background",
                  )}
                >
                  {Number(day.date.slice(8))}
                </span>
                {day.entries.length > 0 && (
                  <span aria-hidden className="pointer-events-none flex justify-center gap-0.5 sm:hidden">
                    {day.entries.slice(0, SHOWN).map((entry) => (
                      <span
                        key={entry.href}
                        className={cn(
                          "size-1.5 rounded-full",
                          entry.meeting ? "bg-chart-bar dark:bg-primary" : "bg-foreground/40",
                        )}
                      />
                    ))}
                  </span>
                )}
                <ul className="hidden min-w-0 gap-1 sm:grid">
                  {day.entries.slice(0, SHOWN).map((entry) => (
                    <li key={entry.href} className="min-w-0">
                      <EntryChip entry={entry} />
                    </li>
                  ))}
                </ul>
                {extra > 0 && (
                  <Link
                    href={`/tasks/calendar?view=week&on=${day.date}`}
                    className="relative z-10 hidden px-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline sm:block"
                  >
                    +{extra} more
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div className="sm:hidden">
        <DayAgenda as="div" date={open.date} today={today} entries={open.entries} />
      </div>
    </div>
  );
}
