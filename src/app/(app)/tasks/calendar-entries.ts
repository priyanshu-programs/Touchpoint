import { addDays, dateIn, formatTime, startOfWeek, toLocalInput } from "@/lib/time";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";

export type Entry = {
  href: string;
  title: string;
  time?: string;
  meeting: boolean;
  // All-day meetings, then tasks without a time, then the rest by the clock.
  order: number;
  // Minutes from the day's midnight in the owner's zone; absent for all-day and untimed.
  startMin?: number;
  endMin?: number;
};

const ALL_DAY = -2;
const NO_TIME = -1;
const DAY = 24 * 60;
const TASK_LENGTH = 30;

function minutesOn(date: string, instant: Date, timezone: string) {
  const local = toLocalInput(instant, timezone);
  if (local.slice(0, 10) < date) return 0;
  if (local.slice(0, 10) > date) return DAY;
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

export function entriesOn(
  date: string,
  tasks: TaskListRow[],
  meetings: ListedMeeting[],
  timezone: string,
): Entry[] {
  const fromTasks = tasks
    .filter((task) => task.dueOn === date)
    .map((task) => {
      const startMin = task.dueAt ? minutesOn(date, task.dueAt, timezone) : undefined;
      return {
        href: `/tasks/${task.id}`,
        title: task.title,
        time: task.dueAt ? formatTime(task.dueAt, timezone) : undefined,
        meeting: false,
        order: task.dueAt?.getTime() ?? NO_TIME,
        startMin,
        endMin: startMin === undefined ? undefined : Math.min(startMin + TASK_LENGTH, DAY),
      };
    });
  const fromMeetings = meetings
    .filter((meeting) =>
      meeting.allDay
        ? meeting.startsOn! <= date && date < meeting.endsOn!
        : dateIn(timezone, meeting.startsAt!) === date,
    )
    .map((meeting) => ({
      href: `/meetings/${meeting.id}`,
      title: meeting.title,
      time: meeting.allDay ? "All day" : formatTime(meeting.startsAt!, timezone),
      meeting: true,
      order: meeting.startsAt?.getTime() ?? ALL_DAY,
      startMin: meeting.allDay ? undefined : minutesOn(date, meeting.startsAt!, timezone),
      endMin: meeting.allDay ? undefined : minutesOn(date, meeting.endsAt!, timezone),
    }));
  return [...fromMeetings, ...fromTasks].toSorted((a, b) => a.order - b.order);
}

export type Placed = Entry & { startMin: number; endMin: number; lane: number; lanes: number };

// Timed entries side by side where they overlap: each takes the first free column of the
// run of entries it overlaps, and every entry in that run shares the run's column count.
export function lanes(entries: Entry[]): Placed[] {
  const timed = entries
    .filter((entry) => entry.startMin !== undefined)
    .map((entry) => ({
      ...entry,
      startMin: entry.startMin!,
      endMin: Math.max(entry.endMin!, entry.startMin! + 1),
    }))
    .toSorted((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: Placed[] = [];
  let run: Placed[] = [];
  let runEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const entry of run) entry.lanes = laneEnds.length;
    run = [];
    laneEnds = [];
  };
  for (const entry of timed) {
    if (entry.startMin >= runEnd) close();
    let lane = laneEnds.findIndex((end) => end <= entry.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.endMin;
    const item = { ...entry, lane, lanes: 1 };
    run.push(item);
    placed.push(item);
    runEnd = Math.max(runEnd, entry.endMin);
  }
  close();
  return placed;
}

// The weeks shown for the month holding this date: from the start of the week holding
// its first day to the end of the week holding its last.
export function monthRange(date: string, weekStart: number) {
  const first = `${date.slice(0, 8)}01`;
  const next = nextMonth(first);
  return {
    first,
    start: startOfWeek(first, weekStart),
    through: addDays(startOfWeek(addDays(next, -1), weekStart), 6),
  };
}

export function nextMonth(first: string) {
  const [year, month] = first.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function previousMonth(first: string) {
  const [year, month] = first.split("-").map(Number);
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}
