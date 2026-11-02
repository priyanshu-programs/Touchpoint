import { describe, expect, it } from "vitest";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";
import { nextUp, todaySummary } from "./next-up";

const timezone = "Asia/Kolkata";
const today = "2026-11-02";
const now = new Date("2026-11-02T06:30:00Z"); // 12:00 in Kolkata
const day = { today, now, timezone };

const task = (title: string, dueOn: string, more: Partial<TaskListRow> = {}) =>
  ({
    id: `id-${title}`,
    title,
    dueOn,
    dueAt: null,
    contactName: null,
    organizationName: null,
    ...more,
  }) as TaskListRow;

const meeting = (title: string, startsAt: string, endsAt: string, more: Partial<ListedMeeting> = {}) =>
  ({
    id: `id-${title}`,
    title,
    allDay: false,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    startsOn: null,
    endsOn: null,
    meetingUrl: null,
    ...more,
  }) as ListedMeeting;

const allDay = (title: string, startsOn: string, endsOn: string) =>
  ({
    id: `id-${title}`,
    title,
    allDay: true,
    startsAt: null,
    endsAt: null,
    startsOn,
    endsOn,
    meetingUrl: null,
  }) as ListedMeeting;

const later = meeting("Maple kickoff", "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z", {
  meetingUrl: "https://meet.google.com/abc",
});
const running = meeting("Standup", "2026-11-02T06:00:00Z", "2026-11-02T07:00:00Z");
const finished = meeting("Early call", "2026-11-02T03:00:00Z", "2026-11-02T04:00:00Z");
const nextWeek = meeting("Maple review", "2026-11-05T10:00:00Z", "2026-11-05T11:00:00Z");
const overdue = task("Renew domain", "2026-10-30", { organizationName: "Maple Studio" });
const dueToday = task("Send proposal", today, { contactName: "Ava Stone" });
const upcoming = task("Prepare notes", "2026-11-04");

const none = { due: [], upcoming: [], meetings: [] };

describe("nextUp", () => {
  it("puts a meeting still to come today before any task", () => {
    const next = nextUp({ ...none, due: [overdue], meetings: [later] }, day);
    expect(next).toEqual({
      label: "Meeting",
      title: "Maple kickoff",
      when: "Today at 15:30",
      who: null,
      href: "/meetings/id-Maple kickoff",
      joinUrl: "https://meet.google.com/abc",
    });
  });

  it("calls a meeting under way on now", () => {
    const next = nextUp({ ...none, meetings: [running, later] }, day);
    expect(next).toMatchObject({ label: "On now", title: "Standup" });
  });

  it("passes over a meeting that has ended", () => {
    expect(nextUp({ ...none, due: [dueToday], meetings: [finished] }, day)?.title).toBe("Send proposal");
    expect(nextUp({ ...none, meetings: [finished] }, day)).toBeNull();
  });

  it("takes the most overdue task, with who it is for", () => {
    const next = nextUp({ ...none, due: [overdue, dueToday], meetings: [nextWeek] }, day);
    expect(next).toEqual({
      label: "Overdue",
      title: "Renew domain",
      when: "Was due Fri, 30 Oct 2026",
      who: "Maple Studio",
      href: "/tasks/id-Renew domain",
      joinUrl: null,
    });
  });

  it("says when a task due today is, with its time if it has one", () => {
    expect(nextUp({ ...none, due: [dueToday] }, day)).toMatchObject({
      label: "Due today",
      when: "Today",
      who: "Ava Stone",
    });
    const timed = task("Call bank", today, { dueAt: new Date("2026-11-02T09:30:00Z") });
    expect(nextUp({ ...none, due: [timed] }, day)?.when).toBe("Today at 15:00");
  });

  it("then takes the next meeting of the week before the next task", () => {
    const next = nextUp({ ...none, upcoming: [upcoming], meetings: [nextWeek] }, day);
    expect(next).toMatchObject({ label: "Meeting", title: "Maple review", when: "Thu, 5 Nov 2026 at 15:30" });
  });

  it("puts a task due today before an all-day meeting, and an all-day meeting says so", () => {
    const holiday = allDay("Offsite", "2026-11-01", "2026-11-03");
    expect(nextUp({ ...none, due: [dueToday], meetings: [holiday] }, day)?.title).toBe("Send proposal");
    expect(nextUp({ ...none, meetings: [holiday] }, day)).toMatchObject({
      label: "Meeting",
      when: "Today, all day",
    });
  });

  it("then takes the next task of the week", () => {
    expect(nextUp({ ...none, upcoming: [upcoming] }, day)).toMatchObject({
      label: "Coming up",
      when: "Wed, 4 Nov 2026",
    });
  });

  it("gives nothing when there is nothing", () => {
    expect(nextUp(none, day)).toBeNull();
  });
});

describe("todaySummary", () => {
  it("counts what is overdue, due and on today", () => {
    expect(
      todaySummary({ due: [overdue, dueToday, dueToday], meetings: [later, finished, nextWeek] }, day),
    ).toBe("1 overdue, 2 due today, 2 meetings today.");
  });

  it("leaves out what there is none of", () => {
    expect(todaySummary({ due: [overdue], meetings: [] }, day)).toBe("1 overdue.");
    expect(todaySummary({ due: [], meetings: [later] }, day)).toBe("1 meeting today.");
  });

  it("does not repeat the task list's own sentence when nothing is due", () => {
    const summary = todaySummary({ due: [], meetings: [] }, day);
    expect(summary).toBe("Nothing due today.");
    expect(summary).not.toContain("Nothing is due today");
  });
});
