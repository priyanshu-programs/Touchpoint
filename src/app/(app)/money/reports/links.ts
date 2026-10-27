import type { DateRange, Period } from "@/modules/revenue/period";
import type { ReportDetail, ReportParams } from "@/modules/reports/schema";

export type PeriodKeep = Pick<ReportParams, "period" | "from" | "to">;

// The period as the address named it: a period from the menu, or the owner's own dates.
export const periodKeep = (period: Period | null, range: DateRange): PeriodKeep =>
  period ? { period } : { from: range.from, to: range.to };

// The reports, or the rows behind one of them, for the same period.
export function reportsHref(
  keep: PeriodKeep,
  detail?: ReportDetail,
  more: Partial<ReportParams> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...keep, ...more })) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `/money/reports${detail ? `/${detail}` : ""}${query ? `?${query}` : ""}`;
}
