import { and, eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { REMINDER_JOB, sendReminder } from "@/modules/tasks/service";
import { enqueue, runDueJobs, type JobHandlers } from "./service";

const HEARTBEAT = "system.heartbeat";

export const handlers: JobHandlers = {
  // Finishing is the signal: System status shows when the last heartbeat completed.
  [HEARTBEAT]: async () => {},
  [REMINDER_JOB]: sendReminder,
};

export async function tick(budgetMs: number) {
  await enqueue({ kind: HEARTBEAT, dedupeKey: HEARTBEAT });
  return runDueJobs(handlers, budgetMs);
}

export async function lastTickAt() {
  const [row] = await db
    .select({ at: max(jobs.finishedAt) })
    .from(jobs)
    .where(and(eq(jobs.kind, HEARTBEAT), eq(jobs.status, "done")));
  return row?.at ?? null;
}

// The scheduler is expected every 15 minutes; allow one missed run before reporting it as down.
const TICK_STALE_MS = 35 * 60_000;

export async function schedulerStatus() {
  const lastRunAt = await lastTickAt();
  return {
    lastRunAt,
    running:
      lastRunAt !== null && Date.now() - lastRunAt.getTime() < TICK_STALE_MS,
  };
}
