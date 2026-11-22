import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  generateText,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";

// Fixed in code, as Google's addresses are: no setting can send the key elsewhere.
const KEY_URL = "https://openrouter.ai/api/v1/key";
const REPLY_TIMEOUT_MS = 60_000;

export type DailyUse = { used: number; limit: number; remaining: number };

// OpenRouter adds fields of its own, so anything not named here is ignored.
const keyAnswer = z.object({
  data: z.object({
    free_model_daily_requests: z
      .object({
        used: z.number().int().nonnegative(),
        limit: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
      })
      .optional(),
  }),
});

export type KeyStatus =
  | { ok: true; daily: DailyUse | null }
  | { ok: false; reason: "rejected" | "unreachable" };

// Whether OpenRouter accepts the key, and its own count of today's free requests.
// Asking uses none of them.
export async function keyStatus(apiKey: string): Promise<KeyStatus> {
  let response: Response;
  try {
    response = await fetch(KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "rejected" };
  }
  if (!response.ok) return { ok: false, reason: "unreachable" };
  const parsed = keyAnswer.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, reason: "unreachable" };
  return { ok: true, daily: parsed.data.data.free_model_daily_requests ?? null };
}

export type ReplyProblem = "rejected" | "limit" | "unavailable" | "no_private_model";

// What went wrong, by OpenRouter's status alone. Its own words are never shown. A request
// kept from providers that store data finds none for its model with a 404.
export function replyProblem(error: unknown, privateOnly = false): ReplyProblem {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 401 || status === 403) return "rejected";
  if (status === 429) return "limit";
  if (status === 404 && privateOnly) return "no_private_model";
  return "unavailable";
}

// Google forbids letting a provider train on its users' data, so a request holding any
// goes only to providers that keep nothing, through the owner's private model if set.
export function routeFor({
  mainModel,
  backupModel,
  privateModel,
  privateOnly,
}: {
  mainModel: string;
  backupModel: string;
  privateModel: string | null;
  privateOnly: boolean;
}) {
  if (!privateOnly) {
    return { model: mainModel, settings: backupModel === mainModel ? {} : { models: [backupModel] } };
  }
  const model = privateModel ?? mainModel;
  return { model, settings: { provider: { data_collection: "deny" as const } } };
}

// Each step is one request against the free daily limit.
export const MAX_STEPS = 5;

// One model call, or with tools up to five: the last step has none, so it must answer.
// OpenRouter moves on to the backup itself when the main model is down or busy, and
// nothing is retried here, so a reply never costs more than it shows.
export function streamReply({
  apiKey,
  mainModel,
  backupModel,
  privateModel = null,
  privateOnly = false,
  privateNow,
  instructions,
  messages,
  tools,
  signal,
}: {
  apiKey: string;
  mainModel: string;
  backupModel: string;
  privateModel?: string | null;
  // The chat already holds Google data (meetings, later email).
  privateOnly?: boolean;
  // A tool in this reply has just returned Google data: later steps go the private way.
  privateNow?: () => boolean;
  instructions: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  signal: AbortSignal;
}) {
  const openrouter = createOpenRouter({ apiKey, compatibility: "strict" });
  const chatModel = (onlyPrivate: boolean) => {
    const route = routeFor({ mainModel, backupModel, privateModel, privateOnly: onlyPrivate });
    return openrouter.chat(route.model, route.settings);
  };
  return streamText({
    model: chatModel(privateOnly),
    instructions,
    messages,
    ...(tools && {
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      prepareStep: ({ stepNumber }) => {
        const last = stepNumber >= MAX_STEPS - 1;
        const turnPrivate = !privateOnly && Boolean(privateNow?.());
        if (!last && !turnPrivate) return undefined;
        return {
          ...(last && { activeTools: [] }),
          ...(turnPrivate && { model: chatModel(true) }),
        };
      },
    }),
    maxRetries: 0,
    timeout: REPLY_TIMEOUT_MS,
    abortSignal: signal,
    // The error carries the request, which is the owner's own words: only its status is logged.
    onError: ({ error }) => {
      logger.warn("assistant.reply_failed", {
        status: APICallError.isInstance(error) ? error.statusCode : null,
      });
    },
  });
}

// One request with no tools, for a background job such as the nightly memory tidy.
export async function askOnce({
  apiKey,
  model,
  backupModel,
  instructions,
  prompt,
}: {
  apiKey: string;
  model: string;
  backupModel: string;
  instructions: string;
  prompt: string;
}) {
  const openrouter = createOpenRouter({ apiKey, compatibility: "strict" });
  const result = await generateText({
    model: openrouter.chat(model, {
      models: backupModel === model ? undefined : [backupModel],
    }),
    instructions,
    prompt,
    maxRetries: 0,
    timeout: REPLY_TIMEOUT_MS,
  });
  return result.text;
}
