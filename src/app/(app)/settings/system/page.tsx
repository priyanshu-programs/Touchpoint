import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db/client";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { schedulerStatus } from "@/modules/jobs/tick";
import { getSettings } from "@/modules/settings/service";

export const metadata: Metadata = { title: "System status" };

async function databaseReachable() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export default async function SystemPage() {
  const owner = await requireOwner();
  const [settings, databaseOk, scheduler] = await Promise.all([
    getSettings(owner.id),
    databaseReachable(),
    schedulerStatus(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>
          What this instance can confirm about itself right now.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt>Database</dt>
            <dd>
              <Badge variant={databaseOk ? "secondary" : "destructive"}>
                {databaseOk ? "Reachable" : "Unreachable"}
              </Badge>
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt>
              Scheduler
              <p className="text-muted-foreground">
                Runs reminders and background work. Locally, start it with{" "}
                <code className="font-mono">pnpm worker</code>.
              </p>
            </dt>
            <dd className="text-right">
              <Badge variant={scheduler.running ? "secondary" : "destructive"}>
                {scheduler.lastRunAt === null
                  ? "No run recorded yet"
                  : scheduler.running
                    ? "Running"
                    : "Not running"}
              </Badge>
              {scheduler.lastRunAt && (
                <p className="mt-1 text-muted-foreground">
                  Last run{" "}
                  {formatDateTime(
                    scheduler.lastRunAt,
                    settings?.timezone ?? "UTC",
                  )}
                </p>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Version</dt>
            <dd className="font-mono">{process.env.APP_VERSION}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
