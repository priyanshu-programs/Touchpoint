import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "@/db/client";
import { logger } from "@/lib/logger";
import { tick } from "@/modules/jobs/tick";

const INTERVAL_MS = 15_000;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main() {
  logger.info("worker.started", { intervalMs: INTERVAL_MS });
  while (!stopping) {
    try {
      const summary = await tick(10_000);
      if (summary.retried || summary.failed) logger.warn("worker.tick", summary);
    } catch (error) {
      logger.error("worker.tick_failed", { error });
    }
    await sleep(INTERVAL_MS);
  }
  await pool.end();
  logger.info("worker.stopped");
}

main().catch((error) => {
  logger.error("worker.crashed", { error });
  process.exit(1);
});
