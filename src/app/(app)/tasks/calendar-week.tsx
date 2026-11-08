import Link from "next/link";
import { addDays, formatDate, toLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";
import { entriesOn, lanes } from "./calendar-entries";
import { addTaskHref, DayAgenda, EntryChip, meetingTone, taskTone } from "./calendar-parts";

const HOUR = 48;
const MIN_HEIGHT = 20;
// The hours always shown; the grid grows to take in anything earlier or later.
const FIRST_HOUR = 7;
const LAST_HOUR = 22;

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const dayHeading = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

// A week by the owner's days: from `lg` up a grid with the hours down the side, where an
// empty hour adds a task at that time; on a phone a list of the seven days.
export function CalendarWeek({
  start,
  today,
  timezone,
  tasks,
  meetings,
}: {
  start: string;
  today: string;
  timezone: string;
  tasks: TaskListRow[];
  meetings: ListedMeeting[];
}) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    const entries = entriesOn(date, tasks, meetings, timezone);
    return {
      date,
      entries,
      allDay: entries.filter((entry) => entry.startMin === undefined),
      timed: lanes(entries),
    };
  });
  const timed = days.flatMap((day) => day.timed);
  const firstHour = Math.min(FIRST_HOUR, ...timed.map((entry) => Math.floor(entry.startMin / 60)));
  const lastHour = Math.max(LAST_HOUR, ...timed.map((entry) => Math.ceil(entry.endMin / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const at = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR;
  const nowLocal = toLocalInput(new Date(), timezone);
  const now = Number(nowLocal.slice(11, 13)) * 60 + Number(nowLocal.slice(14, 16));

  return (
    <div className="grid gap-4">
      {days.every((day) => day.entries.length === 0) && (
        <p className="text-sm text-muted-foreground">Nothing this week.</p>
      )}

      <div className="hidden overflow-hidden rounded-md border lg:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] grid-rows-[auto_auto_1fr]">
          <div className="border-b bg-muted/50" />
          <div className="flex items-start justify-end border-b px-2 py-1 text-xs text-muted-foreground">
            All day
          </div>
          <div className="relative" style={{ height: hours.length * HOUR }}>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums first:translate-y-0"
                style={{ top: at(hour * 60) }}
              >
                {hh(hour)}
              </span>
            ))}
          </div>

          {days.map((day, index) => (
            <section
              key={day.date}
              aria-label={formatDate(day.date)}
              aria-current={day.date === today ? "date" : undefined}
              className="row-span-3 row-start-1 grid min-w-0 grid-rows-subgrid border-l"
              style={{ gridColumnStart: index + 2 }}
            >
              <h3
                className={cn(
                  "flex items-baseline justify-center gap-1.5 border-b bg-muted/50 py-2 text-xs font-medium text-muted-foreground",
                  day.date === today && "text-foreground",
                )}
              >
                {dayHeading(day.date)}
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-sm tabular-nums",
                    day.date === today && "bg-foreground font-semibold text-background",
                  )}
                >
                  {Number(day.date.slice(8))}
                </span>
              </h3>
              <div className="relative grid min-h-8 content-start gap-1 border-b p-1">
                <Link
                  href={addTaskHref(day.date)}
                  aria-label={`Add task on ${formatDate(day.date)}`}
                  className="absolute inset-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                />
                {day.allDay.map((entry) => (
                  <EntryChip key={entry.href} entry={entry} />
                ))}
              </div>
              <div className="relative">
                {hours.map((hour) => (
                  <Link
                    key={hour}
                    href={addTaskHref(day.date, hh(hour))}
                    aria-label={`Add task on ${formatDate(day.date)} at ${hh(hour)}`}
                    className="absolute inset-x-0 border-t border-foreground/5 first:border-t-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                    style={{ top: at(hour * 60), height: HOUR }}
                  />
                ))}
                {day.timed.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    title={`${entry.time} ${entry.title}`}
                    className={cn(
                      "absolute z-10 flex min-w-0 flex-col overflow-hidden rounded-sm px-1.5 py-0.5 text-xs ring-1 ring-background hover:brightness-95 dark:hover:brightness-125",
                      entry.meeting ? meetingTone : taskTone,
                    )}
                    style={{
                      top: at(entry.startMin),
                      height: Math.max(at(entry.endMin) - at(entry.startMin), MIN_HEIGHT),
                      left: `${(entry.lane / entry.lanes) * 100}%`,
                      width: `${100 / entry.lanes}%`,
                    }}
                  >
                    <span className="truncate font-medium">{entry.title}</span>
                    <span className="truncate text-muted-foreground tabular-nums">
                      {entry.time}
                    </span>
                  </Link>
                ))}
                {day.date === today && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-destructive"
                    style={{ top: at(now) }}
                  />
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:hidden">
        {days.map((day) => (
          <DayAgenda key={day.date} date={day.date} today={today} entries={day.entries} />
        ))}
      </div>
    </div>
  );
}
