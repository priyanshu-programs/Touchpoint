import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TimelineRow } from "@/modules/activities/queries";
import { contactHref, labelFor } from "../people/labels";

// The heading lines of one timeline entry, as shown on both a record's Timeline tab and Today.
export function TimelineEvent({
  event,
  when,
}: {
  event: TimelineRow;
  when: string;
}) {
  return (
    <>
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
        <span>{when}</span>
        {event.direction && <span>{labelFor(event.direction)}</span>}
        {event.contacts.map((contact) => (
          <Link
            key={contact.id}
            href={contactHref(contact.id)}
            className="underline"
          >
            {contact.name}
          </Link>
        ))}
      </p>
    </>
  );
}
