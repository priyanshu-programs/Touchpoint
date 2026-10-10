import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { backoffMs, enqueue, runDueJobs } from "./service";
import { lastTickAt, tick } from "./tick";

beforeEach(async () => {
  await db.execute(sql`truncate table jobs`);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const getJob = async (id: string) =>
  (await db.select().from(jobs).where(eq(jobs.id, id)))[0];

describe("backoffMs", () => {
  it("doubles from 30 seconds and caps at one hour", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe("enqueue", () => {
  it("refuses a second live job with the same dedupe key", async () => {
    expect(await enqueue({ kind: "a", dedupeKey: "k" })).not.toBeNull();
    expect(await enqueue({ kind: "a", dedupeKey: "k" })).toBeNull();
  });

  it("allows the key again once the first job has finished", async () => {
    await enqueue({ kind: "a", dedupeKey: "k" });
    await runDueJobs({ a: async () => {} }, 5_000);
    expect(await enqueue({ kind: "a", dedupeKey: "k" })).not.toBeNull();
  });
});

describe("runDueJobs", () => {
  it("runs due jobs and leaves future ones pending", async () => {
    const due = (await enqueue({ kind: "a", payload: { n: 1 } }))!;
    const future = (await enqueue({
      kind: "a",
      runAt: new Date(Date.now() + 3_600_000),
    }))!;
    const seen: unknown[] = [];

    const summary = await runDueJobs(
      { a: async (job) => void seen.push(job.payload) },
      5_000,
    );

    expect(summary).toEqual({ done: 1, retried: 0, failed: 0 });
    expect(seen).toEqual([{ n: 1 }]);
    expect((await getJob(due)).status).toBe("done");
    expect((await getJob(future)).status).toBe("pending");
  });

  it("reschedules a failing job with backoff and records the error", async () => {
    const id = (await enqueue({ kind: "a" }))!;
    const before = Date.now();

    const summary = await runDueJobs(
      {
        a: async () => {
          throw new Error("boom");
        },
      },
      5_000,
    );

    const job = await getJob(id);
    expect(summary).toEqual({ done: 0, retried: 1, failed: 0 });
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe("boom");
    expect(job.runAt.getTime()).toBeGreaterThanOrEqual(before + 29_000);
  });

  it("marks a job failed after its last attempt", async () => {
    const id = (await enqueue({ kind: "a", maxAttempts: 1 }))!;
    const summary = await runDueJobs(
      {
        a: async () => {
          throw new Error("boom");
        },
      },
      5_000,
    );
    expect(summary).toEqual({ done: 0, retried: 0, failed: 1 });
    expect((await getJob(id)).status).toBe("failed");
  });

  it("fails a job whose kind has no handler", async () => {
    const id = (await enqueue({ kind: "unknown", maxAttempts: 1 }))!;
    await runDueJobs({}, 5_000);
    expect((await getJob(id)).lastError).toContain("No handler");
  });

  it("hands each job to exactly one of two concurrent runners", async () => {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push((await enqueue({ kind: "a" }))!);
    const seen: string[] = [];
    const handlers = { a: async (job: { id: string }) => void seen.push(job.id) };

    await Promise.all([
      runDueJobs(handlers, 20_000),
      runDueJobs(handlers, 20_000),
    ]);

    expect(seen).toHaveLength(12);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it("releases a lock left behind by a crashed runner", async () => {
    const id = (await enqueue({ kind: "a" }))!;
    await db.execute(sql`
      update jobs set status = 'running', locked_at = now() - interval '11 minutes'
      where id = ${id}
    `);
    const summary = await runDueJobs({ a: async () => {} }, 5_000);
    expect(summary.done).toBe(1);
  });
});

describe("tick", () => {
  it("records a heartbeat that System status can read", async () => {
    expect(await lastTickAt()).toBeNull();
    await tick(5_000);
    expect(await lastTickAt()).toBeInstanceOf(Date);
  });
});
