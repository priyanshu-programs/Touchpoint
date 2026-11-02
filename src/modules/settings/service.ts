import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { settings, user } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { rebaseTimedTasks } from "@/modules/tasks/rebase";
import type { ProfileInput, SettingsInput } from "./schema";

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

// The full name lives on the sign-in row and the rest beside the settings, so one
// transaction keeps the two and the audit row together. False before onboarding.
export async function saveProfile(ownerId: string, input: ProfileInput) {
  const { name, ...details } = input;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        name: user.name,
        preferredName: settings.preferredName,
        jobTitle: settings.jobTitle,
        businessName: settings.businessName,
        phone: settings.phone,
        website: settings.website,
        location: settings.location,
      })
      .from(settings)
      .innerJoin(user, eq(user.id, settings.ownerId))
      .where(eq(settings.ownerId, ownerId))
      .for("update");
    if (!existing) return false;

    const now = new Date();
    await tx
      .update(settings)
      .set({ ...details, updatedAt: now })
      .where(eq(settings.ownerId, ownerId));
    await tx
      .update(user)
      .set({ name, updatedAt: now })
      .where(eq(user.id, ownerId));

    await audit(tx, {
      ownerId,
      actor: "user",
      action: "profile.update",
      entityType: "settings",
      entityId: ownerId,
      before: existing,
      after: input,
    });
    return true;
  });
}
