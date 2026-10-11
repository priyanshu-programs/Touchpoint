import { addDays } from "@/lib/time";

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type Recurrence = {
  frequency: Frequency;
  interval: number;
  // The day the series started on, so "monthly on the 31st" returns to the 31st after February.
  monthDay: number;
};

// Stored as an RRULE (RFC 5545) restricted to these three parts.
export function buildRule(
  frequency: Frequency,
  interval: number,
  firstDate: string,
) {
  return `FREQ=${frequency};INTERVAL=${interval};BYMONTHDAY=${Number(firstDate.slice(8))}`;
}

export function parseRule(rule: string): Recurrence {
  const parts = Object.fromEntries(
    rule.split(";").map((part) => part.split("=")),
  );
  return {
    frequency: parts.FREQ as Frequency,
    interval: Number(parts.INTERVAL),
    monthDay: Number(parts.BYMONTHDAY),
  };
}

function addMonths(date: string, months: number, monthDay: number) {
  const [year, month] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(monthDay, lastDay));
  return first.toISOString().slice(0, 10);
}

function step(date: string, rule: Recurrence, count: number) {
  const steps = rule.interval * count;
  switch (rule.frequency) {
    case "DAILY":
      return addDays(date, steps);
    case "WEEKLY":
      return addDays(date, steps * 7);
    case "MONTHLY":
      return addMonths(date, steps, rule.monthDay);
    case "YEARLY":
      return addMonths(date, steps * 12, rule.monthDay);
  }
}

// The first occurrence after `date` that is not before `notBefore`,
// so completing a long-overdue task does not create one that is already late.
export function nextOccurrence(
  date: string,
  rule: Recurrence,
  notBefore: string,
) {
  for (let count = 1; ; count++) {
    const next = step(date, rule, count);
    if (next >= notBefore) return next;
  }
}
