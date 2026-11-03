import {
  Briefcase,
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
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addDays, dateIn, formatDateTime, formatTime } from "@/lib/time";
import type { TimelineRow } from "@/modules/activities/queries";
import { SEND_CHANNEL_LABELS, type SEND_CHANNELS } from "@/modules/materials/schema";
import { materialHref, sendStatusOptions } from "../materials/labels";
import { removeSendAction, setSendStatusAction } from "../materials/send-actions";
import { StatusMenu } from "../people/(lists)/status-menu";
import { contactHref, labelFor } from "../people/labels";

const ICONS = {
  call: Phone,
  email: Mail,
  meeting: Users,
  linkedin: Briefcase,
  message: MessageSquare,
  note: StickyNote,
} as const;

// A logged activity or a material send as a card on a record's Activity tab.
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
  const today = dateIn(timezone);
  const day = dateIn(timezone, event.occurredAt);
  const when =
    day === today
      ? `Today, ${formatTime(event.occurredAt, timezone)}`
      : day === addDays(today, -1)
        ? `Yesterday, ${formatTime(event.occurredAt, timezone)}`
        : formatDateTime(event.occurredAt, timezone);

  return (
    <article className="flex min-w-0 gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={send ? materialHref(send) : href(event.eventId)}
            scroll={Boolean(send)}
            className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
          >
            {event.title}
          </Link>
          {!send && <Badge variant="secondary">{labelFor(event.kind)}</Badge>}
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
              · {SEND_CHANNEL_LABELS[event.kind as (typeof SEND_CHANNELS)[number]] ?? event.kind}
            </span>
          ) : (
            event.direction && <span>· {labelFor(event.direction)}</span>
          )}
          {event.contacts.map((contact) => (
            <Link key={contact.id} href={contactHref(contact.id)} className="underline">
              {contact.name}
            </Link>
          ))}
        </p>
        {event.outcome && (
          <p className="text-sm break-words">
            <span className="text-muted-foreground">Outcome: </span>
            <LinkedText text={event.outcome} />
          </p>
        )}
        {event.body && (
          <p className="text-sm break-words whitespace-pre-wrap">
            <LinkedText text={event.body} />
          </p>
        )}
      </div>
    </article>
  );
}
