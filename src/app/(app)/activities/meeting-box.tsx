import { Clock, MapPin, NotebookPen, Paperclip } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { dateIn, formatTime } from "@/lib/time";
import type { RecordMeeting } from "@/modules/integrations/meetings";
import { ActivityCard, DetailRow, People } from "./activity-card";

// One meeting as a card. All of its text came from Google, so it is drawn as plain text.
export function MeetingBox({
  meeting,
  timezone,
  href,
  when,
}: {
  meeting: RecordMeeting;
  timezone: string;
  href: string;
  // Join is offered only for a meeting still to come or under way.
  when: "upcoming" | "live" | "past";
}) {
  const hours = meeting.allDay
    ? "All day"
    : `${formatTime(meeting.startsAt!, timezone)} – ${formatTime(meeting.endsAt!, timezone)}`;
  const kept = meeting.hasNotes || meeting.fileCount > 0;

  return (
    <ActivityCard
      day={meeting.allDay ? meeting.startsOn! : dateIn(timezone, meeting.startsAt!)}
      details={
        <>
          <DetailRow icon={Clock}>{hours}</DetailRow>
          {meeting.location && (
            <DetailRow icon={MapPin} title={meeting.location}>
              {meeting.location}
            </DetailRow>
          )}
        </>
      }
      title={
        <div className="flex min-w-0 items-center gap-2">
          {when === "live" && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-chart-bar/15 px-2 py-0.5 text-xs font-medium text-chart-bar dark:bg-primary/15 dark:text-primary">
              <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
              Live
            </span>
          )}
          <Link
            href={href}
            scroll={false}
            className="min-w-0 font-medium break-words underline-offset-4 hover:underline sm:truncate"
          >
            {meeting.title}
          </Link>
        </div>
      }
      below={
        (meeting.people.length > 0 || kept) && (
          <div className="flex items-center gap-3">
            <People people={meeting.people} />
            {meeting.hasNotes && (
              <span title="Has notes" className="text-muted-foreground">
                <NotebookPen aria-hidden className="size-4" />
                <span className="sr-only">Has notes</span>
              </span>
            )}
            {meeting.fileCount > 0 && (
              <span
                title={meeting.fileCount === 1 ? "1 file" : `${meeting.fileCount} files`}
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
              >
                <Paperclip aria-hidden className="size-4" />
                {meeting.fileCount}
                <span className="sr-only">{meeting.fileCount === 1 ? " file" : " files"}</span>
              </span>
            )}
          </div>
        )
      }
      action={
        when !== "past" &&
        meeting.meetingUrl && (
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: when === "live" ? "default" : "outline", size: "sm" })}
          >
            Join
          </a>
        )
      }
    />
  );
}
