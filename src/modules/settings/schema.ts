import { z } from "zod";
import { blankToNull, phoneNumber, text } from "@/lib/form";
import { isTimezone } from "@/lib/time";
import { httpUrl } from "@/lib/url";

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

export const profileInput = z.strictObject({
  name: text(100).min(1, "Enter your full name"),
  preferredName: text(60).min(1, "Enter the name you want to be referred to as"),
  jobTitle: blankToNull(text(100)),
  businessName: blankToNull(text(120)),
  phone: blankToNull(phoneNumber),
  website: blankToNull(httpUrl),
  location: blankToNull(text(120)),
});

export type ProfileInput = z.infer<typeof profileInput>;
