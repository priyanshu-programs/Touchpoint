import { dateIn, formatDate, formatTime } from "@/lib/time";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";

export type NextUp = {
  label: string;
  title: string;
  when: string;
  who: string | null;
  href: string;
  joinUrl: string | null;
};

type Day = { today: string; now: Date; timezone: string };

const counted = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

function meetingDay(meeting: ListedMeeting, { today, timezone }: Day) {
  if (!meeting.allDay) return dateIn(timezone, meeting.startsAt!);
  return meeting.startsOn! < today ? today : meeting.startsOn!;
}

function fromMeeting(meeting: ListedMeeting, day: Day): NextUp {
  const date = meetingDay(meeting, day);
  const dayText = date === day.today ? "Today" : formatDate(date);
  const started = !meeting.allDay && meeting.startsAt! <= day.now;
  return {
    label: started ? "On now" : "Meeting",
    title: meeting.title,
    when: meeting.allDay
      ? `${dayText}, all day`
      : `${dayText} at ${formatTime(meeting.startsAt!, day.timezone)}`,
    who: null,
    href: `/meetings/${meeting.id}`,
    joinUrl: meeting.meetingUrl,
  };
}

function fromTask(task: TaskListRow, day: Day): NextUp {
  const overdue = task.dueOn! < day.today;
  const time = task.dueAt ? ` at ${formatTime(task.dueAt, day.timezone)}` : "";
  return {
    label: overdue ? "Overdue" : task.dueOn === day.today ? "Due today" : "Coming up",
    title: task.title,
    when: overdue
      ? `Was due ${formatDate(task.dueOn!)}`
      : `${task.dueOn === day.today ? "Today" : formatDate(task.dueOn!)}${time}`,
    who: task.contactName ?? task.organizationName,
    href: `/tasks/${task.id}`,
    joinUrl: null,
  };
}

// The one thing to look at first. A meeting today can't wait, so it comes before any task;
// after the tasks that are due, whatever is soonest in the coming week. `due` and `upcoming`
// arrive soonest first and `meetings` by start, as their queries give them.
export function nextUp(
  { due, upcoming, meetings }: { due: TaskListRow[]; upcoming: TaskListRow[]; meetings: ListedMeeting[] },
  day: Day,
): NextUp | null {
  const unfinished = meetings.filter((meeting) => meeting.allDay || meeting.endsAt! > day.now);
  const todayTimed = unfinished.find(
    (meeting) => !meeting.allDay && meetingDay(meeting, day) === day.today,
  );
  if (todayTimed) return fromMeeting(todayTimed, day);
  if (due[0]) return fromTask(due[0], day);
  if (unfinished[0]) return fromMeeting(unfinished[0], day);
  if (upcoming[0]) return fromTask(upcoming[0], day);
  return null;
}

// The line under the page's heading. It says "Nothing due today" because "Nothing is due
// today." is the task list's own sentence, and the two would read as a repeat.
export function todaySummary(
  { due, meetings }: { due: TaskListRow[]; meetings: ListedMeeting[] },
  day: Day,
) {
  const overdue = due.filter((task) => task.dueOn! < day.today).length;
  const dueToday = due.length - overdue;
  const meetingsToday = meetings.filter((meeting) => meetingDay(meeting, day) === day.today).length;
  const parts = [
    overdue > 0 && `${overdue} overdue`,
    dueToday > 0 && `${dueToday} due today`,
    meetingsToday > 0 && `${counted(meetingsToday, "meeting")} today`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(", ")}.` : "Nothing due today.";
}
