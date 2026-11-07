import { describe, expect, it } from "vitest";
import type { ListedMeeting } from "@/modules/integrations/meetings";
import type { TaskListRow } from "@/modules/tasks/queries";
import { type Entry, entriesOn, lanes, monthRange, nextMonth, previousMonth } from "./calendar-entries";

const timed = (title: string, startMin: number, endMin: number): Entry => ({
  href: `/x/${title}`,
  title,
  meeting: true,
  order: startMin,
  startMin,
  endMin,
});

describe("lanes", () => {
  it("gives entries that don't overlap the whole width", () => {
    const placed = lanes([timed("a", 540, 600), timed("b", 600, 660)]);
    expect(placed.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("puts overlapping entries side by side and reuses a freed column", () => {
    const placed = lanes([
      timed("a", 540, 660),
      timed("b", 570, 600),
      timed("c", 600, 630),
      timed("d", 720, 780),
    ]);
    const byTitle = Object.fromEntries(placed.map((entry) => [entry.title, entry]));
    expect([byTitle.a.lane, byTitle.b.lane, byTitle.c.lane]).toEqual([0, 1, 1]);
    expect([byTitle.a.lanes, byTitle.b.lanes, byTitle.c.lanes]).toEqual([2, 2, 2]);
    expect([byTitle.d.lane, byTitle.d.lanes]).toEqual([0, 1]);
  });

  it("leaves out entries without a time", () => {
    expect(lanes([{ href: "/t", title: "t", meeting: false, order: -1 }])).toEqual([]);
  });
});

describe("monthRange", () => {
  it("covers whole weeks from Monday", () => {
    expect(monthRange("2030-03-17", 1)).toEqual({
      first: "2030-03-01",
      start: "2030-02-25",
      through: "2030-03-31",
    });
  });

  it("covers whole weeks from Sunday", () => {
    expect(monthRange("2030-03-17", 0)).toEqual({
      first: "2030-03-01",
      start: "2030-02-24",
      through: "2030-04-06",
    });
  });

  it("is four weeks when a February fits exactly", () => {
    expect(monthRange("2027-02-10", 1)).toEqual({
      first: "2027-02-01",
      start: "2027-02-01",
      through: "2027-02-28",
    });
  });

  it("is six weeks when a month spreads over them", () => {
    const { start, through } = monthRange("2026-08-15", 1);
    expect([start, through]).toEqual(["2026-07-27", "2026-09-06"]);
  });

  it("moves across a year", () => {
    expect(nextMonth("2030-12-01")).toBe("2031-01-01");
    expect(previousMonth("2030-01-01")).toBe("2029-12-01");
  });
});

describe("entriesOn", () => {
  const task = (dueOn: string, dueAt: Date | null) =>
    ({ id: "t1", title: "Send contract", dueOn, dueAt }) as TaskListRow;
  const meeting = (startsAt: string, endsAt: string) =>
    ({
      id: "m1",
      title: "Kickoff",
      allDay: false,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      startsOn: null,
      endsOn: null,
    }) as ListedMeeting;

  it("places times in the owner's zone, a task as half an hour", () => {
    const [entry] = entriesOn(
      "2030-03-05",
      [task("2030-03-05", new Date("2030-03-05T04:00:00Z"))],
      [],
      "Asia/Kolkata",
    );
    expect([entry.startMin, entry.endMin]).toEqual([9 * 60 + 30, 10 * 60]);
  });

  it("cuts a meeting running past midnight at the end of its day", () => {
    const [entry] = entriesOn(
      "2030-03-06",
      [],
      [meeting("2030-03-06T22:00:00Z", "2030-03-07T01:00:00Z")],
      "UTC",
    );
    expect([entry.startMin, entry.endMin]).toEqual([22 * 60, 24 * 60]);
  });
});
