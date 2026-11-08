import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Entry } from "./calendar-entries";

export const meetingTone =
  "border-l-2 border-chart-bar bg-chart-bar/10 dark:border-primary dark:bg-primary/15";
export const taskTone = "border-l-2 border-foreground/30 bg-muted";

export const addTaskHref = (date: string, time?: string) =>
  `/tasks/new?due=${date}${time ? `&time=${time}` : ""}`;

export function EntryChip({ entry, className }: { entry: Entry; className?: string }) {
  return (
    <Link
      href={entry.href}
      title={entry.time ? `${entry.time} ${entry.title}` : entry.title}
      className={cn(
        "relative z-10 flex min-w-0 items-baseline gap-1 rounded-sm px-1.5 py-0.5 text-xs hover:brightness-95 dark:hover:brightness-125",
        entry.meeting ? meetingTone : taskTone,
        className,
      )}
    >
      {entry.time && (
        <span className="shrink-0 text-muted-foreground tabular-nums">{entry.time}</span>
      )}
      <span className="min-w-0 truncate font-medium">{entry.title}</span>
    </Link>
  );
}

// One day as a list, for a phone, where a grid would be too narrow to read.
export function DayAgenda({
  date,
  today,
  entries,
  as: Tag = "section",
}: {
  date: string;
  today: string;
  entries: Entry[];
  // A month's grid already names each day as a region, so its list below is not one.
  as?: "section" | "div";
}) {
  return (
    <Tag
      aria-label={Tag === "section" ? formatDate(date) : undefined}
      aria-current={Tag === "section" && date === today ? "date" : undefined}
      className="grid content-start gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium break-words">
          {date === today ? `Today, ${formatDate(date)}` : formatDate(date)}
        </h3>
        <ButtonLink
          href={addTaskHref(date)}
          variant="ghost"
          size="sm"
          aria-label={`Add task on ${formatDate(date)}`}
        >
          Add task
        </ButtonLink>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on this day.</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {entries.map((entry) => (
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
    </Tag>
  );
}
