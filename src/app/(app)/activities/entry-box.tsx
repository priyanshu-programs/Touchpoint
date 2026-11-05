import {
  Briefcase,
  Clock,
  FileText,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { LinkedText } from "@/components/linked-text";
import { Button } from "@/components/ui/button";
import { dateIn, formatDateTime, formatTime } from "@/lib/time";
import type { TimelineRow } from "@/modules/activities/queries";
import { SEND_CHANNEL_LABELS, type SEND_CHANNELS } from "@/modules/materials/schema";
import { materialHref, sendStatusOptions } from "../materials/labels";
import { removeSendAction, setSendStatusAction } from "../materials/send-actions";
import { StatusMenu } from "../people/(lists)/status-menu";
import { contactHref, labelFor } from "../people/labels";
import { ActivityCard, CARD_LINK, DetailRow, People } from "./activity-card";

const ICONS = {
  call: Phone,
  email: Mail,
  meeting: Users,
  linkedin: Briefcase,
  message: MessageSquare,
  note: StickyNote,
} as const;

// A logged activity or a material send as a card on a record's Activity tab. Its notes
// show as one line; the whole of them is in the activity it opens.
export function EntryBox({
  event,
  timezone,
  href,
}: {
  event: TimelineRow;
  timezone: string;
  // Where an activity opens; a send opens its material.
  href: (id: string) => string;
}) {
  const send = event.eventType === "material_send" && event.materialId;
  const Icon = send ? FileText : (ICONS[event.kind as keyof typeof ICONS] ?? Flag);
  const preview = [event.outcome, event.body].filter((text): text is string => Boolean(text));

  return (
    <ActivityCard
      day={dateIn(timezone, event.occurredAt)}
      details={
        <>
          <DetailRow icon={Clock}>{formatTime(event.occurredAt, timezone)}</DetailRow>
          <DetailRow icon={Icon}>
            {send ? (
              (SEND_CHANNEL_LABELS[event.kind as (typeof SEND_CHANNELS)[number]] ??
              event.kind)
            ) : (
              <>
                <span>{labelFor(event.kind)}</span>
                {event.direction && <span> · {labelFor(event.direction)}</span>}
              </>
            )}
          </DetailRow>
        </>
      }
      title={
        <Link
          href={send ? materialHref(send) : href(event.eventId)}
          scroll={Boolean(send)}
          className={CARD_LINK}
        >
          {event.title}
        </Link>
      }
      below={
        (event.contacts.length > 0 || preview.length > 0) && (
          <div className="flex min-w-0 items-center gap-3">
            <People people={event.contacts} href={contactHref} />
            {preview.length > 0 && (
              <p className="line-clamp-1 min-w-0 text-sm break-words text-muted-foreground [&_a]:relative [&_a]:z-10">
                {preview.map((text, index) => (
                  <Fragment key={index}>
                    {index > 0 && " · "}
                    <LinkedText text={text} />
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        )
      }
      action={
        send && (
          <>
            {event.status && (
              <StatusMenu
                label="Status"
                value={event.status}
                options={sendStatusOptions}
                action={setSendStatusAction.bind(null, event.eventId)}
              />
            )}
            <form action={removeSendAction}>
              <input type="hidden" name="id" value={event.eventId} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove the send of ${event.title} on ${formatDateTime(event.occurredAt, timezone)}`}
              >
                <X aria-hidden />
              </Button>
            </form>
          </>
        )
      }
    />
  );
}
