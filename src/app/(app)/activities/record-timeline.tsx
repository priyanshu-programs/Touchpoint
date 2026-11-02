import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/button-link";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { countRecordEvents, listTimeline } from "@/modules/activities/queries";
import { recordMeetings } from "@/modules/integrations/meetings";
import { schedulingState } from "@/modules/integrations/scheduling";
import { googleConnection } from "@/modules/integrations/service";
import { getSettings } from "@/modules/settings/service";
import type { ActivitySection } from "../people/(lists)/list-controls";
import { EntryBox } from "./entry-box";
import { MeetingBox } from "./meeting-box";

const PAGE = 30;
const UPCOMING = 20;
// How many of each the overview shows before "See all".
const PREVIEW = { meetings: 5, sends: 5, activities: 10 };

// A record's Activity tab: upcoming meetings, past meetings, materials sent and logged
// activities, each in a section of its own. One section can be opened alone and paged.
export async function RecordTimeline({
  ownerId,
  filter,
  section,
  sectionHref,
  newHref,
  sendHref,
  scheduleHref,
  openHref,
  meetingHref,
  after,
}: {
  ownerId: string;
  filter: { contactId: string } | { organizationId: string };
  section?: ActivitySection;
  // The tab with one section alone (from `after` on, when given), or with all of them.
  sectionHref: (section?: ActivitySection, after?: string) => string;
  newHref: string;
  // Logs that a material went to this record.
  sendHref: string;
  // Offered once Google is connected. The form says if a permission is still needed.
  scheduleHref: string;
  openHref: (id: string) => string;
  meetingHref: (id: string) => string;
  after?: string;
}) {
  const shows = (which: ActivitySection) => !section || section === which;
  const limit = (which: ActivitySection) => (section ? PAGE : PREVIEW[which]);
  const cursor = section ? after : undefined;
  const none = { rows: [], nextAfter: null };

  const [settings, scheduling, google, counts, past, sends, activities] =
    await Promise.all([
      getSettings(ownerId),
      schedulingState(ownerId),
      googleConnection(ownerId),
      countRecordEvents(ownerId, filter),
      shows("meetings")
        ? recordMeetings(ownerId, filter, {
            when: "past",
            after: cursor,
            limit: limit("meetings"),
          })
        : none,
      shows("sends")
        ? listTimeline(ownerId, {
            ...filter,
            eventType: "material_send",
            after: cursor,
            limit: limit("sends"),
          })
        : none,
      shows("activities")
        ? listTimeline(ownerId, {
            ...filter,
            eventType: "activity",
            after: cursor,
            limit: limit("activities"),
          })
        : none,
    ]);
  const timezone = settings?.timezone ?? "UTC";
  // A copy of the calendar can outlast its connection, and its future is then not shown.
  const connected = google && google.status !== "revoked";
  const upcoming =
    connected && shows("meetings") && !cursor
      ? await recordMeetings(ownerId, filter, { when: "upcoming", limit: UPCOMING })
      : none;

  const footer = (which: ActivitySection, total: number, shown: number, next: string | null) =>
    section ? (
      next && (
        <Link href={sectionHref(which, next)} scroll={false} className="text-sm underline">
          Earlier
        </Link>
      )
    ) : (
      total > shown && (
        <Link href={sectionHref(which)} scroll={false} className="text-sm underline">
          See all ({total})
        </Link>
      )
    );
  const empty =
    upcoming.rows.length + past.rows.length + sends.rows.length + activities.rows.length ===
    0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
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
      <CardContent className="grid gap-4">
        {section && (
          <Link
            href={sectionHref()}
            scroll={false}
            className="inline-flex items-center gap-1 justify-self-start text-sm underline"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            All activity
          </Link>
        )}
        {empty && (
          <p className="text-sm text-muted-foreground">
            {cursor ? "Nothing earlier." : "Nothing logged yet."}
          </p>
        )}
        {upcoming.rows.length > 0 && (
          <Section title="Upcoming meetings" count={upcoming.rows.length}>
            {upcoming.rows.map((meeting) => (
              <li key={meeting.id}>
                <MeetingBox
                  meeting={meeting}
                  timezone={timezone}
                  href={meetingHref(meeting.id)}
                  joinable
                />
              </li>
            ))}
          </Section>
        )}
        {past.rows.length > 0 && (
          <Section
            title="Past meetings"
            count={counts.meetings}
            footer={footer("meetings", counts.meetings, past.rows.length, past.nextAfter)}
          >
            {past.rows.map((meeting) => (
              <li key={meeting.id}>
                <MeetingBox
                  meeting={meeting}
                  timezone={timezone}
                  href={meetingHref(meeting.id)}
                  joinable={false}
                />
              </li>
            ))}
          </Section>
        )}
        {sends.rows.length > 0 && (
          <Section
            title="Materials sent"
            count={counts.sends}
            footer={footer("sends", counts.sends, sends.rows.length, sends.nextAfter)}
          >
            {sends.rows.map((event) => (
              <li key={event.eventId}>
                <EntryBox event={event} timezone={timezone} href={openHref} />
              </li>
            ))}
          </Section>
        )}
        {activities.rows.length > 0 && (
          <Section
            title="Activities"
            count={counts.activities}
            footer={footer(
              "activities",
              counts.activities,
              activities.rows.length,
              activities.nextAfter,
            )}
          >
            {activities.rows.map((event) => (
              <li key={event.eventId}>
                <EntryBox event={event} timezone={timezone} href={openHref} />
              </li>
            ))}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  count,
  footer,
  children,
}: {
  title: string;
  count: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-3 rounded-xl bg-muted/50 p-3">
      <h2 className="flex items-center gap-2 px-1 text-sm font-medium">
        {title}
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </h2>
      <ul className="grid gap-2">{children}</ul>
      {footer && <div className="px-1">{footer}</div>}
    </section>
  );
}
