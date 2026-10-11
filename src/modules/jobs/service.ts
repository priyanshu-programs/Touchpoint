import { eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { jobs } from "@/db/schema";
import { logger } from "@/lib/logger";

export type ClaimedJob = {
  id: string;
  ownerId: string | null;
  kind: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};
export type JobHandlers = Record<string, (job: ClaimedJob) => Promise<void>>;

export function backoffMs(attempts: number) {
  return Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);
}

// Pass the caller's transaction when the job must exist only if the change that needs it commits.
export async function enqueue(
  input: {
    kind: string;
    payload?: Record<string, unknown>;
    runAt?: Date;
    dedupeKey?: string;
    ownerId?: string;
    maxAttempts?: number;
  },
  executor: Executor = db,
) {
  const [row] = await executor
    .insert(jobs)
    .values(input)
    .onConflictDoNothing({
      target: jobs.dedupeKey,
      where: sql`status in ('pending', 'running')`,
    })
    .returning({ id: jobs.id });
  return row?.id ?? null;
}

async function claimNext() {
  const result = await db.execute<ClaimedJob>(sql`
    update jobs
    set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs
      where status = 'pending' and run_at <= now()
      order by run_at
      limit 1
      for update skip locked
    )
    returning id, owner_id as "ownerId", kind, payload, attempts, max_attempts as "maxAttempts"
  `);
  return result.rows[0];
}

// A serverless invocation can die mid-job; its lock would otherwise hold the job forever.
async function releaseStaleLocks() {
  await db.execute(sql`
    update jobs set status = 'pending', locked_at = null, updated_at = now()
    where status = 'running' and locked_at < now() - interval '10 minutes'
  `);
}

async function pruneFinished() {
  await db.execute(sql`
    delete from jobs
    where status in ('done', 'failed') and finished_at < now() - interval '7 days'
  `);
}

export async function runDueJobs(handlers: JobHandlers, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  const summary = { done: 0, retried: 0, failed: 0 };
  await releaseStaleLocks();
  await pruneFinished();

  while (Date.now() < deadline) {
    const job = await claimNext();
    if (!job) break;

    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
      await handler(job);
      await db
        .update(jobs)
        .set({
          status: "done",
          finishedAt: new Date(),
          lockedAt: null,
          lastError: null,
        })
        .where(eq(jobs.id, job.id));
      summary.done++;
    } catch (error) {
      const exhausted = job.attempts >= job.maxAttempts;
      const lastError = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 2000);
      await db
        .update(jobs)
        .set(
          exhausted
            ? {
                status: "failed",
                finishedAt: new Date(),
                lockedAt: null,
                lastError,
              }
            : {
                status: "pending",
                runAt: new Date(Date.now() + backoffMs(job.attempts)),
                lockedAt: null,
                lastError,
              },
        )
        .where(eq(jobs.id, job.id));
      logger.error("job.failed", {
        jobId: job.id,
        kind: job.kind,
        attempts: job.attempts,
        exhausted,
        error,
      });
      if (exhausted) summary.failed++;
      else summary.retried++;
    }
  }
  return summary;
}
