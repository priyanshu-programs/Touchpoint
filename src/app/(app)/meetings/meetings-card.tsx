import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateIn, formatDate, formatTime } from "@/lib/time";
import type { ListedMeeting } from "@/modules/integrations/meetings";

// Today's card: the meetings of the week ahead, by the owner's days. One that began before
// today is shown under today.
export function MeetingsCard({
  meetings,
  today,
  timezone,
}: {
  meetings: ListedMeeting[];
  today: string;
  timezone: string;
}) {
  const dayOf = (meeting: ListedMeeting) =>
    meeting.allDay
      ? meeting.startsOn! < today
        ? today
        : meeting.startsOn!
      : dateIn(timezone, meeting.startsAt!);
  const sorted = meetings.toSorted(
    (a, b) =>
      dayOf(a).localeCompare(dayOf(b)) ||
      Number(b.allDay) - Number(a.allDay) ||
      (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0),
  );
  const days: { date: string; meetings: ListedMeeting[] }[] = [];
  for (const meeting of sorted) {
    const date = dayOf(meeting);
    if (days.at(-1)?.date === date) days.at(-1)!.meetings.push(meeting);
    else days.push({ date, meetings: [meeting] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meetings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {days.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No meetings in the next seven days.
          </p>
        )}
        {days.map((day) => (
          <section key={day.date} className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {day.date === today ? "Today" : formatDate(day.date)}
            </h2>
            <ul className="grid gap-2">
              {day.meetings.map((meeting) => (
                <li key={meeting.id} className="flex min-w-0 items-baseline gap-3 text-sm">
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                    {meeting.allDay ? "All day" : formatTime(meeting.startsAt!, timezone)}
                  </span>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
                  >
                    {meeting.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
