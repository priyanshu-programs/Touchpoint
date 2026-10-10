import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { CURRENCIES, TIMEZONES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>
          Signed in as {owner.name} ({owner.email}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsForm
          currencies={CURRENCIES}
          timezones={TIMEZONES}
          values={
            settings && {
              baseCurrency: settings.baseCurrency,
              timezone: settings.timezone,
              weekStart: settings.weekStart,
              fiscalYearStartMonth: settings.fiscalYearStartMonth,
            }
          }
          submitLabel="Save changes"
        />
      </CardContent>
    </Card>
  );
}
