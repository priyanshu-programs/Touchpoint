import { X } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { MAX_LISTED_SENDS, type MaterialSendRow } from "@/modules/materials/queries";
import { SEND_CHANNEL_LABELS } from "@/modules/materials/schema";
import { companyHref, contactHref } from "../../people/labels";
import { StatusMenu } from "../../people/(lists)/status-menu";
import { sendStatusOptions } from "../labels";
import { removeSendAction, setSendStatusAction } from "../send-actions";

// Who each version went to and how it was received, the latest first.
export function SendsCard({
  materialId,
  sends,
  timezone,
  canSend,
}: {
  materialId: string;
  sends: MaterialSendRow[];
  timezone: string;
  canSend: boolean;
}) {
  return (
    <Card role="region" aria-labelledby="sends-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="sends-heading">Sends</h2>
        </CardTitle>
        {canSend && (
          <CardAction>
            <ButtonLink href={`/materials/${materialId}/send`} variant="outline" size="sm">
              Log a send
            </ButtonLink>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canSend
              ? "Not sent to anyone yet."
              : "Not sent to anyone yet. Add a version to send it."}
          </p>
        ) : (
          <ul className="grid gap-4">
            {sends.map((send) => (
              <li key={send.id} className="flex min-w-0 items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary">{send.versionLabel}</Badge>
                    <span>{formatDateTime(send.sentAt, timezone)}</span>
                    <span className="text-muted-foreground">
                      {SEND_CHANNEL_LABELS[send.channel]}
                    </span>
                    <StatusMenu
                      label="Status"
                      value={send.status}
                      options={sendStatusOptions}
                      action={setSendStatusAction.bind(null, send.id)}
                    />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    {send.contacts.map((contact) => (
                      <Link key={contact.id} href={contactHref(contact.id)} className="underline">
                        {contact.name}
                      </Link>
                    ))}
                    {send.organizationId && send.organizationName && (
                      <Link href={companyHref(send.organizationId)} className="underline">
                        {send.organizationName}
                      </Link>
                    )}
                  </p>
                  {send.note && (
                    <p className="text-sm break-words whitespace-pre-wrap">{send.note}</p>
                  )}
                </div>
                <form action={removeSendAction}>
                  <input type="hidden" name="id" value={send.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove the send of ${send.versionLabel} on ${formatDateTime(send.sentAt, timezone)}`}
                  >
                    <X aria-hidden />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {sends.length === MAX_LISTED_SENDS && (
          <p className="text-xs text-muted-foreground">
            The latest {MAX_LISTED_SENDS} are shown. Each person&apos;s Activity tab has all of theirs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
