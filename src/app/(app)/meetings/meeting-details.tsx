import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { buttonVariants } from "@/components/ui/button";
import {
  addDays,
  dateIn,
  formatDate,
  formatDateTime,
  formatTime,
  isFuture,
} from "@/lib/time";
import type { Meeting } from "@/modules/integrations/meetings";
import { companyHref, contactHref } from "../people/labels";

// Google's end date is the day after an all-day meeting's last.
function meetingWhen(meeting: Meeting, timezone: string) {
  if (meeting.allDay) {
    const last = addDays(meeting.endsOn!, -1);
    return last === meeting.startsOn
      ? `${formatDate(meeting.startsOn!)}, all day`
      : `${formatDate(meeting.startsOn!)} to ${formatDate(last)}, all day`;
  }
  return `${formatDateTime(meeting.startsAt!, timezone)} to ${formatTime(meeting.endsAt!, timezone)}`;
}

// An activity can't be logged for a time still to come.
const hasStarted = (meeting: Meeting, timezone: string) =>
  meeting.allDay
    ? meeting.startsOn! <= dateIn(timezone)
    : !isFuture(meeting.startsAt!);

const external = { target: "_blank", rel: "noopener noreferrer" };

// One meeting, in a record's panel or on its own page. Its text is a stranger's: plain only.
export function MeetingDetails({
  meeting,
  timezone,
  notesHref,
}: {
  meeting: Meeting;
  timezone: string;
  notesHref: string;
}) {
  return (
    <div className="grid gap-4 text-sm">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">When</dt>
        <dd>{meetingWhen(meeting, timezone)}</dd>
        {meeting.location && (
          <>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="break-words">{meeting.location}</dd>
          </>
        )}
        {meeting.organization && (
          <>
            <dt className="text-muted-foreground">Company</dt>
            <dd className="break-words">
              <Link href={companyHref(meeting.organization.id)} className="underline">
                {meeting.organization.name}
              </Link>
            </dd>
          </>
        )}
        {meeting.people.length > 0 && (
          <>
            <dt className="text-muted-foreground">People</dt>
            <dd className="flex flex-wrap gap-x-2 gap-y-1">
              {meeting.people.map((person) => (
                <Link
                  key={person.id}
                  href={contactHref(person.id)}
                  className="break-words underline"
                >
                  {person.name}
                </Link>
              ))}
            </dd>
          </>
        )}
        {meeting.attendees.length > 0 && (
          <>
            <dt className="text-muted-foreground">Guests</dt>
            <dd>
              <ul className="grid gap-1">
                {meeting.attendees.map((guest) => (
                  <li key={guest.email} className="break-words">
                    {guest.name ? `${guest.name} (${guest.email})` : guest.email}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {hasStarted(meeting, timezone) && (
          <ButtonLink href={notesHref} scroll={false} size="sm">
            Log notes
          </ButtonLink>
        )}
        {meeting.meetingUrl && (
          <a
            href={meeting.meetingUrl}
            {...external}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Join meeting
          </a>
        )}
        {meeting.htmlLink && (
          <a
            href={meeting.htmlLink}
            {...external}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open in Google Calendar
          </a>
        )}
      </div>
    </div>
  );
}
