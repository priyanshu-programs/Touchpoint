import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand-mark";
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

export const metadata: Metadata = { title: "Set up your workspace" };

const OPTIONAL = [
  {
    name: "Google Calendar",
    enables:
      "Your meetings beside the people and companies they're with. Connect it any time in Settings → Integrations.",
  },
  {
    name: "AI assistant (coming later)",
    enables:
      "Questions answered from your own records, your Gmail read on request, summaries and suggested next actions.",
  },
  {
    name: "Contact enrichment",
    enables: "Public company details suggested for review when adding a contact.",
  },
];

export default async function OnboardingPage() {
  const owner = await requireOwner();
  if (await getSettings(owner.id)) redirect("/");

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 p-4 py-10">
      <BrandLockup />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your workspace
        </h1>
        <p className="text-muted-foreground">
          Welcome, {owner.name}. Two more details and you are in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            You can change these later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            currencies={CURRENCIES}
            timezones={TIMEZONES}
            values={null}
            submitLabel="Finish setup"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Optional integrations</CardTitle>
          <CardDescription>
            Touchpoint works without any of these. Each is opt-in and uses your
            own free credentials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            {OPTIONAL.map((item) => (
              <div key={item.name}>
                <dt className="font-medium">{item.name}</dt>
                <dd className="text-muted-foreground">{item.enables}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
