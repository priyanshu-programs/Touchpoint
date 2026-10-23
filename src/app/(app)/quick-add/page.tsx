import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn } from "@/lib/time";
import { ownerTimezone } from "@/modules/settings/service";
import { listTemplates } from "@/modules/workflows/queries";
import { QuickAddForm } from "./quick-add-form";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage() {
  const owner = await requireOwner();
  const [templates, timezone] = await Promise.all([
    listTemplates(owner.id),
    ownerTimezone(db, owner.id),
  ]);
  const workflows = [
    ...templates.filter(({ starterKey }) => starterKey === "prospecting"),
    ...templates.filter(({ starterKey }) => starterKey !== "prospecting"),
  ].map(({ id, name }) => ({ value: id, label: name }));

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h1>Quick add</h1>
        </CardTitle>
        <CardDescription>
          A person, where they work, and what happens next, in one go.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuickAddForm
          workflows={workflows}
          followUpDate={addDays(dateIn(timezone), 3)}
        />
      </CardContent>
    </Card>
  );
}
