import { z } from "zod";

export const CURRENCIES = Intl.supportedValuesOf("currency");
export const TIMEZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];

// The runtime's list holds one canonical name per zone (Asia/Calcutta, not Asia/Kolkata),
// so membership would reject valid aliases that browsers report.
function isTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const settingsInput = z.strictObject({
  baseCurrency: z.string().refine((value) => CURRENCIES.includes(value), {
    message: "Choose a currency from the list",
  }),
  timezone: z.string().refine(isTimezone, {
    message: "Choose a valid time zone",
  }),
  weekStart: z.coerce.number().int().min(0).max(6),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
});

export type SettingsInput = z.infer<typeof settingsInput>;
