import { Clock, MapPin } from "lucide-react";
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
  joinable,
}: {
  meeting: RecordMeeting;
  timezone: string;
  href: string;
  // Join is offered only for a meeting still to come.
  joinable: boolean;
}) {
  const when = meeting.allDay
    ? "All day"
    : `${formatTime(meeting.startsAt!, timezone)} – ${formatTime(meeting.endsAt!, timezone)}`;

  return (
    <ActivityCard
      day={meeting.allDay ? meeting.startsOn! : dateIn(timezone, meeting.startsAt!)}
      details={
        <>
          <DetailRow icon={Clock}>{when}</DetailRow>
          {meeting.location && (
            <DetailRow icon={MapPin} title={meeting.location}>
              {meeting.location}
            </DetailRow>
          )}
        </>
      }
      title={
        <Link
          href={href}
          scroll={false}
          className="min-w-0 font-medium break-words underline-offset-4 hover:underline sm:truncate"
        >
          {meeting.title}
        </Link>
      }
      below={<People people={meeting.people} />}
      action={
        joinable &&
        meeting.meetingUrl && (
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Join
          </a>
        )
      }
    />
  );
}
