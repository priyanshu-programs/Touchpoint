import { describe, expect, it } from "vitest";
import {
  addDays,
  dateIn,
  daysBetween,
  formatDate,
  formatTime,
  fromLocalInput,
  startOfWeek,
  toLocalInput,
} from "./time";

describe("time zone conversion", () => {
  it("reads a wall-clock time in a zone with a fixed offset", () => {
    expect(fromLocalInput("2026-10-11T09:30", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-11T04:00:00.000Z",
    );
  });

  it("uses the offset in force on that date where clocks change", () => {
    expect(
      fromLocalInput("2026-01-15T09:00", "America/New_York").toISOString(),
    ).toBe("2026-01-15T14:00:00.000Z");
    expect(
      fromLocalInput("2026-07-15T09:00", "America/New_York").toISOString(),
    ).toBe("2026-07-15T13:00:00.000Z");
  });

  it("is right on the day the clocks change", () => {
    // New York moves from UTC-5 to UTC-4 at 02:00 on 8 March 2026.
    expect(
      fromLocalInput("2026-03-08T01:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T06:30:00.000Z");
    expect(
      fromLocalInput("2026-03-08T09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
  });

  it("round-trips through the form representation", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York"]) {
      expect(
        toLocalInput(fromLocalInput("2026-12-31T23:45", zone), zone),
      ).toBe("2026-12-31T23:45");
    }
  });

  it("gives the calendar date in the zone, not in UTC", () => {
    const instant = new Date("2026-10-10T20:00:00Z");
    expect(dateIn("UTC", instant)).toBe("2026-10-10");
    expect(dateIn("Asia/Kolkata", instant)).toBe("2026-10-11");
  });

  it("shows the time of day in the zone", () => {
    const instant = new Date("2026-10-10T20:00:00Z");
    expect(formatTime(instant, "UTC")).toBe("20:00");
    expect(formatTime(instant, "Asia/Kolkata")).toBe("01:30");
  });
});

describe("calendar dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("counts days between two dates, negative when the second is earlier", () => {
    expect(daysBetween("2026-10-11", "2026-10-14")).toBe(3);
    expect(daysBetween("2026-10-11", "2026-10-10")).toBe(-1);
  });

  it("finds the start of the week from the owner's first day", () => {
    expect(startOfWeek("2026-10-14", 1)).toBe("2026-10-12");
    expect(startOfWeek("2026-10-14", 0)).toBe("2026-10-11");
    expect(startOfWeek("2026-10-14", 6)).toBe("2026-10-10");
  });

  it("leaves a date that already starts the week", () => {
    expect(startOfWeek("2026-10-12", 1)).toBe("2026-10-12");
    expect(startOfWeek("2026-10-11", 0)).toBe("2026-10-11");
  });

  it("finds the start of the week across month and year ends", () => {
    expect(startOfWeek("2026-11-01", 1)).toBe("2026-10-26");
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28");
  });

  it("formats a date without shifting it", () => {
    expect(formatDate("2026-10-11")).toBe("Sun, 11 Oct 2026");
  });
});
