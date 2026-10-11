import { z } from "zod";
import { isTimezone } from "@/lib/time";

export const CURRENCIES = Intl.supportedValuesOf("currency");
export const TIMEZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];

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
