import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dateIn, formatDate, formatTime } from "@/lib/time";
import { listTimeline, type TimelineRow } from "@/modules/activities/queries";
import { getSettings } from "@/modules/settings/service";
import { labelFor } from "../people/labels";

// The Timeline tab of a record: what happened, newest first, a page at a time.
export async function RecordTimeline({
  ownerId,
  filter,
  path,
  newHref,
  after,
}: {
  ownerId: string;
  filter: { contactId: string } | { organizationId: string };
  path: string;
  newHref: string;
  after?: string;
}) {
  const timezone = (await getSettings(ownerId))?.timezone ?? "UTC";
  const page = await listTimeline(ownerId, { ...filter, after });
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
        <CardAction>
          <ButtonLink href={newHref} variant="outline" size="sm">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{labelFor(event.kind)}</Badge>
                    <Link
                      href={`/activities/${event.eventId}`}
                      className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
                    >
                      {event.title}
                    </Link>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{formatTime(event.occurredAt, timezone)}</span>
                    {event.direction && <span>{labelFor(event.direction)}</span>}
                    {event.contacts.map((contact) => (
                      <Link
                        key={contact.id}
                        href={`/people/contacts/${contact.id}`}
                        className="underline"
                      >
                        {contact.name}
                      </Link>
                    ))}
                  </p>
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
            href={`${path}?after=${page.nextAfter}`}
            className="justify-self-start text-sm underline"
          >
            Earlier
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
