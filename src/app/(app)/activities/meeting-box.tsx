import { Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { ContactAvatar } from "@/components/company-logo";
import { buttonVariants } from "@/components/ui/button";
import { dateIn, formatTime } from "@/lib/time";
import type { RecordMeeting } from "@/modules/integrations/meetings";

const SHOWN_PEOPLE = 4;

const dayPart = (date: string, part: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...part, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

// One meeting as a card: its day on the left, then when, where and who. All of its text
// came from Google, so it is drawn as plain text.
export function MeetingBox({
  meeting,
  timezone,
  href,
  joinable,
}: {
  meeting: RecordMeeting;
  timezone: string;
  href: string;
  // Join is offered only for a meeting still to come.
  joinable: boolean;
}) {
  const day = meeting.allDay ? meeting.startsOn! : dateIn(timezone, meeting.startsAt!);
  const when = meeting.allDay
    ? "All day"
    : `${formatTime(meeting.startsAt!, timezone)} – ${formatTime(meeting.endsAt!, timezone)}`;
  const extra = meeting.people.length - SHOWN_PEOPLE;

  return (
    <article className="flex min-w-0 gap-4 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex w-12 shrink-0 flex-col items-center justify-center border-r pr-4 text-center">
        <span className="text-xs font-medium text-orange-600 uppercase dark:text-orange-400">
          {dayPart(day, { weekday: "short" })}
        </span>
        <span className="text-2xl leading-tight font-semibold text-orange-600 tabular-nums dark:text-orange-400">
          {dayPart(day, { day: "numeric" })}
        </span>
        <span className="text-xs text-muted-foreground">
          {dayPart(day, { month: "short" })}
        </span>
      </div>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Link
          href={href}
          scroll={false}
          className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
        >
          {meeting.title}
        </Link>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          <Clock aria-hidden className="size-3.5 shrink-0" />
          <span>{when}</span>
        </p>
        {meeting.location && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{meeting.location}</span>
          </p>
        )}
        {(meeting.people.length > 0 || (joinable && meeting.meetingUrl)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {meeting.people.length > 0 && (
              <p className="flex items-center">
                <span className="sr-only">
                  With {meeting.people.map((person) => person.name).join(", ")}
                </span>
                <span aria-hidden className="flex -space-x-2">
                  {meeting.people.slice(0, SHOWN_PEOPLE).map((person) => (
                    <span key={person.id} title={person.name}>
                      <ContactAvatar
                        id={person.id}
                        name={person.name}
                        photoVersion={person.photoVersion}
                        className="ring-2 ring-card"
                      />
                    </span>
                  ))}
                </span>
                {extra > 0 && (
                  <span aria-hidden className="ml-2 text-xs text-muted-foreground">
                    +{extra}
                  </span>
                )}
              </p>
            )}
            {joinable && meeting.meetingUrl && (
              <a
                href={meeting.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Join
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
