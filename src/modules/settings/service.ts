import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { settings } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { rebaseTimedTasks } from "@/modules/tasks/rebase";
import type { SettingsInput } from "./schema";

export async function getSettings(ownerId: string) {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.ownerId, ownerId));
  return row ?? null;
}

export async function ownerTimezone(executor: Executor, ownerId: string) {
  const [row] = await executor
    .select({ timezone: settings.timezone })
    .from(settings)
    .where(eq(settings.ownerId, ownerId));
  return row?.timezone ?? "UTC";
}

const pick = (row: SettingsInput): SettingsInput => ({
  baseCurrency: row.baseCurrency,
  timezone: row.timezone,
  weekStart: row.weekStart,
  fiscalYearStartMonth: row.fiscalYearStartMonth,
});

export async function saveSettings(ownerId: string, input: SettingsInput) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(settings)
      .where(eq(settings.ownerId, ownerId));

    const [saved] = await tx
      .insert(settings)
      .values({ ownerId, ...input, onboardingCompletedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.ownerId,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    if (existing && existing.timezone !== saved.timezone) {
      await rebaseTimedTasks(tx, ownerId, saved.timezone);
    }

    await audit(tx, {
      ownerId,
      actor: "user",
      action: existing ? "settings.update" : "settings.create",
      entityType: "settings",
      entityId: ownerId,
      before: existing ? pick(existing) : undefined,
      after: pick(saved),
    });
    return saved;
  });
}
