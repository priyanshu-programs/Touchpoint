import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { aiSettings, DEFAULT_ASSISTANT_MODELS } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { assistantKeyInput, assistantModelsInput } from "./schema";
import {
  assistantSettings,
  assistantUse,
  openAssistant,
  removeAssistantKey,
  saveAssistantKey,
  saveAssistantModels,
} from "./service";

const openrouter = vi.hoisted(() => ({ keyStatus: vi.fn() }));
vi.mock("@/ai/openrouter", async (actual) => ({
  ...(await actual<typeof import("@/ai/openrouter")>()),
  ...openrouter,
}));

const KEY = "sk-or-v1-0123456789abcdefWXYZ";

describe("assistant settings", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    openrouter.keyStatus.mockReset();
  });

  it("starts with no key and the default models", async () => {
    expect(await assistantSettings(ownerId)).toEqual({
      key: "none",
      keyEnding: null,
      models: DEFAULT_ASSISTANT_MODELS,
    });
    expect(await openAssistant(ownerId)).toEqual({ state: "none" });
  });

  it("seals the key, shows only its ending and audits without it", async () => {
    await saveAssistantKey(ownerId, KEY);
    const [row] = await db.select().from(aiSettings).where(eq(aiSettings.ownerId, ownerId));
    expect(row.apiKeyEnc).not.toContain(KEY);
    expect(await assistantSettings(ownerId)).toMatchObject({ key: "ready", keyEnding: "WXYZ" });
    expect(await openAssistant(ownerId)).toMatchObject({ state: "ready", apiKey: KEY });

    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({ action: "assistant.key_save", after: { keyEnding: "WXYZ" } });
    expect(JSON.stringify(rows)).not.toContain(KEY);
  });

  it("says a key sealed with another encryption key can't be read", async () => {
    const sealed = encryptSecret(KEY, "another-encryption-key-0123456789abcdef");
    await db
      .insert(aiSettings)
      .values({ ownerId, apiKeyEnc: sealed.value, keyVersion: sealed.keyVersion });
    expect((await assistantSettings(ownerId)).key).toBe("unreadable");
    expect(await openAssistant(ownerId)).toEqual({ state: "unreadable" });
    expect(await assistantUse(ownerId)).toEqual({ state: "unreadable" });
    expect(openrouter.keyStatus).not.toHaveBeenCalled();
  });

  it("removes the key and keeps the models", async () => {
    await saveAssistantKey(ownerId, KEY);
    await saveAssistantModels(ownerId, {
      mainModel: "google/gemma-4-31b-it:free",
      helperModel: "google/gemma-4-31b-it:free",
      backupModel: "nvidia/nemotron-3.5-lightning:free",
    });
    await removeAssistantKey(ownerId);
    const settings = await assistantSettings(ownerId);
    expect(settings.key).toBe("none");
    expect(settings.models.backupModel).toBe("nvidia/nemotron-3.5-lightning:free");
    expect((await listAudit(ownerId)).rows.map((row) => row.action)).toEqual([
      "assistant.key_remove",
      "assistant.models_save",
      "assistant.key_save",
    ]);
  });

  it("reports today's free requests from OpenRouter's count", async () => {
    await saveAssistantKey(ownerId, KEY);
    openrouter.keyStatus.mockResolvedValue({
      ok: true,
      daily: { used: 12, limit: 50, remaining: 38 },
    });
    expect(await assistantUse(ownerId)).toEqual({
      state: "ready",
      daily: { used: 12, limit: 50, remaining: 38 },
    });
    expect(openrouter.keyStatus).toHaveBeenCalledWith(KEY);

    openrouter.keyStatus.mockResolvedValue({ ok: false, reason: "rejected" });
    expect(await assistantUse(ownerId)).toEqual({ state: "rejected" });
  });

  it("keeps one owner's key from another", async () => {
    await saveAssistantKey(ownerId, KEY);
    const other = await createTestOwner("other@example.com");
    expect(await openAssistant(other)).toEqual({ state: "none" });
  });
});

describe("assistant inputs", () => {
  it("takes only an OpenRouter key", () => {
    expect(assistantKeyInput.safeParse({ apiKey: ` ${KEY} ` }).data?.apiKey).toBe(KEY);
    expect(assistantKeyInput.safeParse({ apiKey: "sk-ant-0123456789abcdefghij" }).success).toBe(
      false,
    );
    expect(assistantKeyInput.safeParse({ apiKey: `${KEY} x` }).success).toBe(false);
    expect(assistantKeyInput.safeParse({ apiKey: KEY, extra: 1 }).success).toBe(false);
  });

  it("takes only free models", () => {
    const models = {
      mainModel: "google/gemma-4-31b-it:free",
      helperModel: "google/gemma-4-31b-it:free",
      backupModel: "nvidia/nemotron-3.5-lightning:free",
    };
    expect(assistantModelsInput.safeParse(models).success).toBe(true);
    expect(
      assistantModelsInput.safeParse({ ...models, mainModel: "openai/gpt-5" }).success,
    ).toBe(false);
    expect(
      assistantModelsInput.safeParse({ ...models, mainModel: "../key:free" }).success,
    ).toBe(false);
  });
});
