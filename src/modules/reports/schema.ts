import { z } from "zod";
import { PERIODS } from "@/modules/revenue/period";

// The reports whose rows have a page of their own.
export const REPORT_DETAILS = [
  "clients",
  "services",
  "unallocated",
  "time-to-payment",
  "follow-ups",
  "replies",
  "proposals",
] as const;
export type ReportDetail = (typeof REPORT_DETAILS)[number];

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

// What `/money/reports` and a report's rows show, read from the address. A service is
// named as on its invoice lines; `unnamed` asks for the lines that name none.
export const reportParams = z.object({
  period: optional(z.enum(PERIODS)),
  from: optional(z.iso.date()),
  to: optional(z.iso.date()),
  service: optional(z.string().trim().min(1).max(60)),
  unnamed: optional(z.literal("1")),
  page: optional(z.coerce.number().int().min(1).max(1000)),
});
export type ReportParams = z.infer<typeof reportParams>;
