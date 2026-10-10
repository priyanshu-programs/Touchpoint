import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { settingsInput } from "./schema";
import { getSettings, saveSettings } from "./service";

const input = {
  baseCurrency: "INR",
  timezone: "Asia/Kolkata",
  weekStart: 1,
  fiscalYearStartMonth: 4,
};

describe("settingsInput", () => {
  it("accepts valid settings and coerces form strings", () => {
    expect(
      settingsInput.parse({ ...input, weekStart: "0", fiscalYearStartMonth: "4" }),
    ).toEqual({ ...input, weekStart: 0 });
  });

  it.each([
    ["an unknown currency", { baseCurrency: "XXQ" }],
    ["an unknown time zone", { timezone: "Mars/Olympus" }],
    ["a week start out of range", { weekStart: 7 }],
    ["a month out of range", { fiscalYearStartMonth: 13 }],
    ["an unexpected field", { role: "admin" }],
  ])("rejects %s", (_label, override) => {
    expect(settingsInput.safeParse({ ...input, ...override }).success).toBe(
      false,
    );
  });
});

describe("saveSettings", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("creates settings, marks onboarding complete and writes an audit row", async () => {
    expect(await getSettings(ownerId)).toBeNull();

    await saveSettings(ownerId, input);

    const saved = await getSettings(ownerId);
    expect(saved).toMatchObject(input);
    expect(saved?.onboardingCompletedAt).toBeInstanceOf(Date);
    const { rows } = await listAudit(ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "settings.create",
      actor: "user",
      after: input,
    });
  });

  it("updates in place and records before and after", async () => {
    await saveSettings(ownerId, input);
    await saveSettings(ownerId, { ...input, timezone: "UTC" });

    expect((await getSettings(ownerId))?.timezone).toBe("UTC");
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "settings.update",
      before: input,
      after: { ...input, timezone: "UTC" },
    });
  });

  it("keeps each owner's settings and audit trail separate", async () => {
    const otherId = await createTestOwner("other@example.com");
    await saveSettings(ownerId, input);

    expect(await getSettings(otherId)).toBeNull();
    expect((await listAudit(otherId)).rows).toHaveLength(0);
  });
});

describe("listAudit", () => {
  it("pages newest first without gaps or repeats", async () => {
    await resetDatabase();
    const ownerId = await createTestOwner();
    for (const timezone of ["UTC", "Asia/Kolkata", "UTC", "Asia/Kolkata", "UTC"]) {
      await saveSettings(ownerId, { ...input, timezone });
    }

    const first = await listAudit(ownerId, { limit: 2 });
    const second = await listAudit(ownerId, {
      limit: 2,
      beforeId: first.nextBeforeId!,
    });
    const third = await listAudit(ownerId, {
      limit: 2,
      beforeId: second.nextBeforeId!,
    });

    const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextBeforeId).toBeNull();
    expect(first.rows[0].createdAt >= first.rows[1].createdAt).toBe(true);
  });
});
