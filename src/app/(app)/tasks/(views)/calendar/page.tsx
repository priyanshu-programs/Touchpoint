import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ButtonLink } from "@/components/button-link";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn, startOfWeek } from "@/lib/time";
import { meetingsBetween } from "@/modules/integrations/meetings";
import { schedulingState } from "@/modules/integrations/scheduling";
import { googleConnection } from "@/modules/integrations/service";
import { getSettings } from "@/modules/settings/service";
import { listDueTasks } from "@/modules/tasks/queries";
import { CalendarWeek } from "../../calendar-week";

export const metadata: Metadata = { title: "Calendar" };

const LISTED = 200;
const SYNCED_DAYS_AHEAD = 90;

// Bounded so that moving a week from here always stays a date the database accepts.
const params = z.object({
  week: z.iso
    .date()
    .refine((date) => date >= "2000-01-01" && date <= "2100-12-31")
    .optional()
    .catch(undefined),
});

export default async function TasksCalendarPage({
  searchParams,
}: PageProps<"/tasks/calendar">) {
  const owner = await requireOwner();
  const { week } = params.parse(await searchParams);
  const settings = await getSettings(owner.id);
  const timezone = settings?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const start = startOfWeek(week ?? today, settings?.weekStart ?? 1);
  const through = addDays(start, 6);
  const [tasks, google, meetings, scheduling] = await Promise.all([
    listDueTasks(owner.id, { from: start, through }),
    googleConnection(owner.id),
    meetingsBetween(owner.id, start, through, timezone, LISTED),
    schedulingState(owner.id),
  ]);
  const connected = google && google.status !== "revoked";

  return (
    <div className="grid gap-4">
      {scheduling !== "off" && (
        <ButtonLink
          href="/meetings/new"
          variant="outline"
          size="sm"
          className="justify-self-end"
        >
          Schedule meeting
        </ButtonLink>
      )}
      <CalendarWeek
        start={start}
        today={today}
        timezone={timezone}
        tasks={tasks}
        meetings={connected ? meetings : []}
        cut={tasks.length === LISTED || meetings.length === LISTED}
      />
      {!connected && (
        <p className="text-sm text-muted-foreground">
          <Link href="/settings/integrations" className="underline">
            Connect Google Calendar
          </Link>{" "}
          to see your meetings here.
        </p>
      )}
      {connected && start > addDays(today, SYNCED_DAYS_AHEAD) && (
        <p className="text-sm text-muted-foreground">
          Meetings are copied from Google up to {SYNCED_DAYS_AHEAD} days ahead.
        </p>
      )}
    </div>
  );
}
