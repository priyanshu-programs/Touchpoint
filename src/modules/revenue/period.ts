import { z } from "zod";

export const PERIODS = [
  "this-month",
  "last-month",
  "this-quarter",
  "this-year",
  "last-12-months",
  "all",
] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  "last-12-months": "Last 12 months",
  all: "All time",
};

// Dates as YYYY-MM-DD; a month past twelve or a day of 0 rolls over as Date.UTC does.
const iso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

export type DateRange = { from?: string; to?: string };

// The dates a period runs between, both included; `today` is the owner's date.
// Quarters and years are calendar ones. All time has no bounds.
export function periodRange(period: Period, today: string): DateRange {
  const [year, month, day] = today.split("-").map(Number);
  switch (period) {
    case "this-month":
      return { from: iso(year, month, 1), to: iso(year, month + 1, 0) };
    case "last-month":
      return { from: iso(year, month - 1, 1), to: iso(year, month, 0) };
    case "this-quarter": {
      const first = month - ((month - 1) % 3);
      return { from: iso(year, first, 1), to: iso(year, first + 3, 0) };
    }
    case "this-year":
      return { from: iso(year, 1, 1), to: iso(year, 12, 31) };
    case "last-12-months":
      return { from: iso(year - 1, month, day + 1), to: today };
    case "all":
      return {};
  }
}

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

// What `/money` shows, read from its address.
export const revenueParams = z.object({
  period: optional(z.enum(PERIODS)),
  from: optional(z.iso.date()),
  to: optional(z.iso.date()),
  company: optional(z.uuid()),
  person: optional(z.uuid()),
});
export type RevenueParams = z.infer<typeof revenueParams>;

// A From and To typed by the owner win over the menu when both are there and in
// order; otherwise the period named, or this month.
export function chosenRange(params: RevenueParams, today: string) {
  if (params.from && params.to && params.from <= params.to) {
    return { period: null, range: { from: params.from, to: params.to } };
  }
  const period = params.period ?? "this-month";
  return { period, range: periodRange(period, today) };
}
