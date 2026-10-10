"use client";

import { useActionState, useSyncExternalStore } from "react";
import { saveSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FormMessage } from "./form-message";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const subscribeToNothing = () => () => {};

// Null on the server and during hydration, the browser's zone afterwards, without a mismatch.
function useBrowserTimezone() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

export type SettingsValues = {
  baseCurrency: string;
  timezone: string;
  weekStart: number;
  fiscalYearStartMonth: number;
};

export function SettingsForm({
  currencies,
  timezones,
  values,
  submitLabel,
}: {
  currencies: string[];
  timezones: string[];
  values: SettingsValues | null;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  const browserTimezone = useBrowserTimezone();
  const timezone = values?.timezone ?? browserTimezone ?? "UTC";
  const timezoneOptions = timezones.includes(timezone)
    ? timezones
    : [timezone, ...timezones];

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="baseCurrency">Base currency</Label>
        <NativeSelect
          id="baseCurrency"
          name="baseCurrency"
          defaultValue={values?.baseCurrency ?? ""}
          required
        >
          <NativeSelectOption value="" disabled>
            Select a currency
          </NativeSelectOption>
          {currencies.map((currency) => (
            <NativeSelectOption key={currency} value={currency}>
              {currency}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          Revenue totals and reports are shown in this currency.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="timezone">Time zone</Label>
        <NativeSelect
          key={timezone}
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          required
        >
          {timezoneOptions.map((zone) => (
            <NativeSelectOption key={zone} value={zone}>
              {zone}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="weekStart">Week starts on</Label>
          <NativeSelect
            id="weekStart"
            name="weekStart"
            defaultValue={values?.weekStart ?? 1}
          >
            {WEEKDAYS.map((day, index) => (
              <NativeSelectOption key={day} value={index}>
                {day}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fiscalYearStartMonth">Financial year starts in</Label>
          <NativeSelect
            id="fiscalYearStartMonth"
            name="fiscalYearStartMonth"
            defaultValue={values?.fiscalYearStartMonth ?? 1}
          >
            {MONTHS.map((month, index) => (
              <NativeSelectOption key={month} value={index + 1}>
                {month}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
