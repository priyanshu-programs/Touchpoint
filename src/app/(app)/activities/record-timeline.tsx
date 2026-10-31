import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dateIn, formatDate, formatTime } from "@/lib/time";
import { listTimeline, type TimelineRow } from "@/modules/activities/queries";
import { schedulingState } from "@/modules/integrations/scheduling";
import { getSettings } from "@/modules/settings/service";
import { TimelineEvent } from "./timeline-event";

// The Timeline tab of a record: what happened, newest first, a page at a time.
export async function RecordTimeline({
  ownerId,
  filter,
  moreHref,
  newHref,
  sendHref,
  scheduleHref,
  openHref,
  meetingHref,
  after,
}: {
  ownerId: string;
  filter: { contactId: string } | { organizationId: string };
  moreHref: (after: string) => string;
  newHref: string;
  // Logs that a material went to this record.
  sendHref: string;
  // Offered once Google is connected. The form says if a permission is still needed.
  scheduleHref: string;
  openHref: (id: string) => string;
  meetingHref: (id: string) => string;
  after?: string;
}) {
  const timezone = (await getSettings(ownerId))?.timezone ?? "UTC";
  const [page, scheduling] = await Promise.all([
    listTimeline(ownerId, { ...filter, after }),
    schedulingState(ownerId),
  ]);
  const today = dateIn(timezone);

  // Days are the owner's calendar days, worked out here so no zone name reaches the database.
  const days: { date: string; events: TimelineRow[] }[] = [];
  for (const event of page.rows) {
    const date = dateIn(timezone, event.occurredAt);
    if (days.at(-1)?.date === date) days.at(-1)!.events.push(event);
    else days.push({ date, events: [event] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardAction className="flex flex-wrap justify-end gap-2">
          {scheduling !== "off" && (
            <ButtonLink href={scheduleHref} scroll={false} variant="outline" size="sm">
              Schedule meeting
            </ButtonLink>
          )}
          <ButtonLink href={sendHref} scroll={false} variant="outline" size="sm">
            Log a send
          </ButtonLink>
          <ButtonLink href={newHref} scroll={false} variant="outline" size="sm">
            Log activity
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        {days.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {after ? "Nothing earlier." : "Nothing logged yet."}
          </p>
        )}
        {days.map((day) => (
          <section key={day.date} className="grid gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {day.date === today ? "Today" : formatDate(day.date)}
            </h2>
            <ul className="grid gap-4">
              {day.events.map((event) => (
                <li key={event.eventId} className="grid min-w-0 gap-1">
                  <TimelineEvent
                    event={event}
                    when={
                      event.kind === "all_day"
                        ? "All day"
                        : formatTime(event.occurredAt, timezone)
                    }
                    hrefFor={openHref}
                    meetingHref={meetingHref}
                  />
                  {event.outcome && (
                    <p className="text-sm break-words">
                      <span className="text-muted-foreground">Outcome: </span>
                      {event.outcome}
                    </p>
                  )}
                  {event.body && (
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {event.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {page.nextAfter && (
          <Link
            href={moreHref(page.nextAfter)}
            className="justify-self-start text-sm underline"
          >
            Earlier
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
