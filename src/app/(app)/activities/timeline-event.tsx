import { X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TimelineRow } from "@/modules/activities/queries";
import { SEND_CHANNEL_LABELS, type SEND_CHANNELS } from "@/modules/materials/schema";
import { materialHref, sendStatusOptions } from "../materials/labels";
import { removeSendAction, setSendStatusAction } from "../materials/send-actions";
import { StatusMenu } from "../people/(lists)/status-menu";
import { contactHref, labelFor } from "../people/labels";

// The heading lines of one timeline entry, as shown on both a record's Timeline tab and Today.
export function TimelineEvent({
  event,
  when,
  hrefFor,
  meetingHref,
}: {
  event: TimelineRow;
  when: string;
  // Where an entry opens: its own page, unless the panel showing it says otherwise.
  hrefFor?: (id: string) => string;
  meetingHref?: (id: string) => string;
}) {
  // A send opens its material, and is removed here if it was logged by mistake.
  const send = event.eventType === "material_send" && event.materialId;
  const meeting = event.eventType === "calendar_event";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {send ? "Sent material" : meeting ? "Meeting" : labelFor(event.kind)}
        </Badge>
        <Link
          href={
            send
              ? materialHref(send)
              : meeting
                ? (meetingHref?.(event.eventId) ?? `/meetings/${event.eventId}`)
                : (hrefFor?.(event.eventId) ?? `/activities/${event.eventId}`)
          }
          // A panel changes in place; a page of its own starts at its top.
          scroll={Boolean(send) || !hrefFor}
          className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
        >
          {event.title}
        </Link>
        {send && event.status && (
          <StatusMenu
            label="Status"
            value={event.status}
            options={sendStatusOptions}
            action={setSendStatusAction.bind(null, event.eventId)}
          />
        )}
        {send && (
          <form action={removeSendAction} className="ml-auto">
            <input type="hidden" name="id" value={event.eventId} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Remove the send of ${event.title} on ${when}`}
            >
              <X aria-hidden />
            </Button>
          </form>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{when}</span>
        {send ? (
          <span>
            {SEND_CHANNEL_LABELS[event.kind as (typeof SEND_CHANNELS)[number]] ?? event.kind}
          </span>
        ) : (
          event.direction && <span>{labelFor(event.direction)}</span>
        )}
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
