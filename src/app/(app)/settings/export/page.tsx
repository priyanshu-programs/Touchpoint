import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { lastExport, MAX_EXPORTS_AN_HOUR } from "@/modules/export/service";
import { getSettings } from "@/modules/settings/service";

export const metadata: Metadata = { title: "Export" };

export default async function ExportPage({ searchParams }: PageProps<"/settings/export">) {
  const owner = await requireOwner();
  const refusedRate = (await searchParams).refused === "rate";
  const [settings, last] = await Promise.all([getSettings(owner.id), lastExport(owner.id)]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export your data</CardTitle>
        <CardDescription>
          Everything you keep in Touchpoint, in one zip file to keep as a backup or open in a
          spreadsheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            <span className="font-medium">data.json</span>: every record as it is stored,
            drawings included.
          </li>
          <li>
            <span className="font-medium">Spreadsheets</span>: companies, people, tasks,
            activities, materials and sends, invoices and their lines, payments, workflows,
            brainstorm boards and the files you added, ready for Excel or Google Sheets.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Left out: your password and sign-in sessions, and the contents of uploaded files and
          pictures. The spreadsheet of files lists each one; open them in Touchpoint.
        </p>
        {refusedRate && (
          <p role="alert" className="text-destructive">
            You&apos;ve exported {MAX_EXPORTS_AN_HOUR} times in the last hour. Try again later.
          </p>
        )}
        <form method="post" action="/api/export" className="flex flex-wrap items-center gap-4">
          <Button type="submit">Download export</Button>
          <span className="text-muted-foreground">
            {last
              ? `Last export: ${formatDateTime(last, settings?.timezone ?? "UTC")}`
              : "No export yet"}
          </span>
        </form>
      </CardContent>
    </Card>
  );
}
