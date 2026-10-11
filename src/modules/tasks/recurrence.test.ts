import { describe, expect, it } from "vitest";
import { buildRule, nextOccurrence, parseRule } from "./recurrence";

const next = (
  date: string,
  frequency: Parameters<typeof buildRule>[0],
  interval = 1,
  notBefore = "0000-01-01",
  firstDate = date,
) =>
  nextOccurrence(
    date,
    parseRule(buildRule(frequency, interval, firstDate)),
    notBefore,
  );

describe("recurrence", () => {
  it("stores the rule as an RRULE and reads it back", () => {
    const rule = buildRule("MONTHLY", 2, "2026-01-31");
    expect(rule).toBe("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31");
    expect(parseRule(rule)).toEqual({
      frequency: "MONTHLY",
      interval: 2,
      monthDay: 31,
    });
  });

  it("steps by days, weeks, months and years", () => {
    expect(next("2026-10-11", "DAILY")).toBe("2026-10-12");
    expect(next("2026-10-11", "DAILY", 3)).toBe("2026-10-14");
    expect(next("2026-10-11", "WEEKLY", 2)).toBe("2026-10-25");
    expect(next("2026-10-11", "MONTHLY")).toBe("2026-11-11");
    expect(next("2026-10-11", "YEARLY")).toBe("2027-10-11");
  });

  it("clamps to the end of a short month, then returns to the original day", () => {
    const february = next("2026-01-31", "MONTHLY");
    expect(february).toBe("2026-02-28");
    expect(next(february, "MONTHLY", 1, "0000-01-01", "2026-01-31")).toBe(
      "2026-03-31",
    );
  });

  it("keeps 29 February on leap years only", () => {
    expect(next("2028-02-29", "YEARLY")).toBe("2029-02-28");
    expect(next("2028-02-29", "YEARLY", 4)).toBe("2032-02-29");
  });

  it("skips occurrences that are already in the past", () => {
    expect(next("2026-10-05", "WEEKLY", 1, "2026-10-28")).toBe("2026-11-02");
    expect(next("2026-10-05", "DAILY", 1, "2026-10-28")).toBe("2026-10-28");
  });
});
