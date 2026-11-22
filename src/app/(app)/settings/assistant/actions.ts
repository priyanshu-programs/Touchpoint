"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/(app)/settings/actions";
import { canEncrypt } from "@/lib/crypto";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  assistantKeyInput,
  assistantModelsInput,
  assistantPrivateModelInput,
} from "@/modules/assistant/schema";
import {
  assistantUse,
  removeAssistantKey,
  saveAssistantKey,
  saveAssistantModels,
  saveAssistantPrivateModel,
} from "@/modules/assistant/service";

export async function saveAssistantKeyAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  if (!canEncrypt()) {
    return { ok: false, message: "Set APP_ENCRYPTION_KEY before saving a key." };
  }
  const parsed = assistantKeyInput.safeParse(readFields(formData, ["apiKey"]));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  await saveAssistantKey(owner.id, parsed.data.apiKey);
  // The panel on every page says whether the assistant is set up.
  revalidatePath("/", "layout");
  return { ok: true, message: "Key saved." };
}

export async function removeAssistantKeyAction() {
  const owner = await requireOwner();
  await removeAssistantKey(owner.id);
  revalidatePath("/", "layout");
}

export async function saveAssistantModelsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = assistantModelsInput.safeParse(
    readFields(formData, ["mainModel", "helperModel", "backupModel"]),
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  await saveAssistantModels(owner.id, parsed.data);
  revalidatePath("/settings/assistant");
  return { ok: true, message: "Models saved." };
}

export async function saveAssistantPrivateModelAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = assistantPrivateModelInput.safeParse(readFields(formData, ["privateModel"]));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  await saveAssistantPrivateModel(owner.id, parsed.data.privateModel || null);
  revalidatePath("/settings/assistant");
  return {
    ok: true,
    message: parsed.data.privateModel ? "Saved." : "Saved. Your main model will be tried.",
  };
}

export async function testAssistantKeyAction(): Promise<FormState> {
  const owner = await requireOwner();
  const use = await assistantUse(owner.id);
  if (use.state === "ready") {
    return {
      ok: true,
      message: use.daily
        ? `OpenRouter accepts this key. ${use.daily.remaining} of ${use.daily.limit} free requests left today.`
        : "OpenRouter accepts this key.",
    };
  }
  return {
    ok: false,
    message: {
      none: "Save a key first.",
      unreadable: "This key was saved with a different encryption key. Enter it again.",
      rejected: "OpenRouter didn't accept this key. Make a new one and save it here.",
      unreachable: "OpenRouter couldn't be reached. Try again in a moment.",
    }[use.state],
  };
}
