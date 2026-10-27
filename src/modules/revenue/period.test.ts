import { describe, expect, it } from "vitest";
import { chosenRange, periodRange, revenueParams } from "./period";

describe("periodRange", () => {
  it.each([
    ["this-month", "2026-10-27", "2026-10-01", "2026-10-31"],
    ["this-month", "2028-02-10", "2028-02-01", "2028-02-29"],
    ["last-month", "2026-10-27", "2026-09-01", "2026-09-30"],
    ["last-month", "2026-01-15", "2025-12-01", "2025-12-31"],
    ["this-quarter", "2026-10-27", "2026-10-01", "2026-12-31"],
    ["this-quarter", "2026-02-03", "2026-01-01", "2026-03-31"],
    ["this-quarter", "2026-06-30", "2026-04-01", "2026-06-30"],
    ["this-year", "2026-10-27", "2026-01-01", "2026-12-31"],
    ["last-12-months", "2026-10-27", "2025-10-28", "2026-10-27"],
    ["last-12-months", "2026-12-31", "2026-01-01", "2026-12-31"],
  ] as const)("%s from %s runs %s to %s", (period, today, from, to) => {
    expect(periodRange(period, today)).toEqual({ from, to });
  });

  it("leaves all time unbounded", () => {
    expect(periodRange("all", "2026-10-27")).toEqual({});
  });
});

describe("chosenRange", () => {
  const read = (search: Record<string, string>) => revenueParams.parse(search);

  it("is this month when nothing is chosen, or when the address is not understood", () => {
    const thisMonth = { period: "this-month", range: { from: "2026-10-01", to: "2026-10-31" } };
    expect(chosenRange(read({}), "2026-10-27")).toEqual(thisMonth);
    expect(chosenRange(read({ period: "decade", company: "nope" }), "2026-10-27")).toEqual(
      thisMonth,
    );
  });

  it("takes a From and To in order over the menu", () => {
    expect(
      chosenRange(read({ period: "all", from: "2026-03-05", to: "2026-04-01" }), "2026-10-27"),
    ).toEqual({ period: null, range: { from: "2026-03-05", to: "2026-04-01" } });
  });

  it("ignores a From after its To, or one without the other", () => {
    expect(
      chosenRange(read({ period: "last-month", from: "2026-05-01", to: "2026-04-01" }), "2026-10-27")
        .period,
    ).toBe("last-month");
    expect(chosenRange(read({ from: "2026-05-01" }), "2026-10-27").period).toBe("this-month");
    expect(read({ from: "2026-02-30" }).from).toBeUndefined();
  });
});
