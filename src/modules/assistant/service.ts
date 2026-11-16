import { eq } from "drizzle-orm";
import { keyStatus, type DailyUse } from "@/ai/openrouter";
import { db } from "@/db/client";
import { aiSettings, DEFAULT_ASSISTANT_MODELS } from "@/db/schema";
import { decryptSecret, encryptSecret, UnreadableSecretError } from "@/lib/crypto";
import { audit } from "@/modules/audit/service";
import type { AssistantModels } from "./schema";

async function settingsRow(ownerId: string) {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.ownerId, ownerId));
  return row ?? null;
}

const modelsOf = (row: AssistantModels | null): AssistantModels => ({
  mainModel: row?.mainModel ?? DEFAULT_ASSISTANT_MODELS.mainModel,
  helperModel: row?.helperModel ?? DEFAULT_ASSISTANT_MODELS.helperModel,
  backupModel: row?.backupModel ?? DEFAULT_ASSISTANT_MODELS.backupModel,
});

// The stored key, opened. "unreadable" is a key sealed with another APP_ENCRYPTION_KEY.
function openKey(row: { apiKeyEnc: string | null; keyVersion: number | null } | null) {
  if (!row?.apiKeyEnc || row.keyVersion === null) return { state: "none" as const };
  try {
    return {
      state: "ready" as const,
      apiKey: decryptSecret(row.apiKeyEnc, row.keyVersion),
    };
  } catch (error) {
    if (!(error instanceof UnreadableSecretError)) throw error;
    return { state: "unreadable" as const };
  }
}

// What Settings and the panel show. The key itself never leaves this module but to
// reach OpenRouter; only its last four characters are shown.
export async function assistantSettings(ownerId: string) {
  const row = await settingsRow(ownerId);
  const key = openKey(row);
  return {
    key: key.state,
    keyEnding: key.state === "ready" ? key.apiKey.slice(-4) : null,
    models: modelsOf(row),
  };
}

// The key and models for a model call, at the moment of use.
export async function openAssistant(
  ownerId: string,
): Promise<
  | { state: "none" }
  | { state: "unreadable" }
  | { state: "ready"; apiKey: string; models: AssistantModels }
> {
  const row = await settingsRow(ownerId);
  const key = openKey(row);
  if (key.state === "none") return { state: "none" };
  if (key.state === "unreadable") return { state: "unreadable" };
  return { state: "ready", apiKey: key.apiKey, models: modelsOf(row) };
}

export async function saveAssistantKey(ownerId: string, apiKey: string) {
  const sealed = encryptSecret(apiKey);
  await db.transaction(async (tx) => {
    await tx
      .insert(aiSettings)
      .values({ ownerId, apiKeyEnc: sealed.value, keyVersion: sealed.keyVersion })
      .onConflictDoUpdate({
        target: aiSettings.ownerId,
        set: {
          apiKeyEnc: sealed.value,
          keyVersion: sealed.keyVersion,
          updatedAt: new Date(),
        },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "assistant.key_save",
      entityType: "assistant",
      entityId: ownerId,
      after: { keyEnding: apiKey.slice(-4) },
    });
  });
}

// The chats stay; only the key goes.
export async function removeAssistantKey(ownerId: string) {
  await db.transaction(async (tx) => {
    const removed = await tx
      .update(aiSettings)
      .set({ apiKeyEnc: null, keyVersion: null, updatedAt: new Date() })
      .where(eq(aiSettings.ownerId, ownerId))
      .returning({ ownerId: aiSettings.ownerId });
    if (removed.length === 0) return;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "assistant.key_remove",
      entityType: "assistant",
      entityId: ownerId,
    });
  });
}

export async function saveAssistantModels(ownerId: string, models: AssistantModels) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.ownerId, ownerId))
      .for("update");
    await tx
      .insert(aiSettings)
      .values({ ownerId, ...models })
      .onConflictDoUpdate({
        target: aiSettings.ownerId,
        set: { ...models, updatedAt: new Date() },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "assistant.models_save",
      entityType: "assistant",
      entityId: ownerId,
      before: modelsOf(existing ?? null),
      after: models,
    });
  });
}

export type AssistantUse =
  | { state: "none" | "unreadable" | "rejected" | "unreachable" }
  | { state: "ready"; daily: DailyUse | null };

// Today's free requests, from OpenRouter's own count. Asking uses none of them.
export async function assistantUse(ownerId: string): Promise<AssistantUse> {
  const assistant = await openAssistant(ownerId);
  if (assistant.state !== "ready") return { state: assistant.state };
  const status = await keyStatus(assistant.apiKey);
  return status.ok ? { state: "ready", daily: status.daily } : { state: status.reason };
}
