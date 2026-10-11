import { and, eq, isNotNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { tasks } from "@/db/schema";
import { dateIn } from "@/lib/time";

// A timed task's calendar date depends on the owner's time zone, so it is recomputed
// when the zone changes. Closed tasks keep the date they had.
export async function rebaseTimedTasks(
  tx: Tx,
  ownerId: string,
  timezone: string,
) {
  const rows = await tx
    .select({ id: tasks.id, dueOn: tasks.dueOn, dueAt: tasks.dueAt })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        eq(tasks.status, "open"),
        isNotNull(tasks.dueAt),
      ),
    );
  for (const row of rows) {
    const dueOn = dateIn(timezone, row.dueAt!);
    if (dueOn !== row.dueOn) {
      await tx.update(tasks).set({ dueOn }).where(eq(tasks.id, row.id));
    }
  }
}
