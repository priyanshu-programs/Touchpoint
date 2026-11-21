"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import {
  confirmAction,
  declineAction,
  taskDetails,
  undoAction,
} from "@/modules/assistant/actions";
import { deleteConversation, getConversation } from "@/modules/assistant/conversations";
import { QUICK_ASKS, quickAnswer, type QuickAsk } from "@/modules/assistant/quick";
import { assistantUse } from "@/modules/assistant/service";

// Today's free requests, for the line under the message box.
export async function assistantUseAction() {
  const owner = await requireOwner();
  return assistantUse(owner.id);
}

// What a chat holds now, to show after a reply broke off.
export async function chatSoFarAction(id: string) {
  const owner = await requireOwner();
  const conversation = await getConversation(owner.id, z.uuid().parse(id));
  return conversation?.messages ?? null;
}

export async function deleteConversationAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  await deleteConversation(owner.id, id);
  revalidatePath("/assistant");
  redirect("/assistant");
}

const quickInput = z.strictObject({
  ask: z.enum(Object.keys(QUICK_ASKS) as [QuickAsk, ...QuickAsk[]]),
  conversationId: z.uuid().nullable(),
});

// A one-tap question, answered with no model call.
export async function quickAnswerAction(ask: string, conversationId: string | null) {
  const owner = await requireOwner();
  const input = quickInput.parse({ ask, conversationId });
  return quickAnswer(owner.id, input.ask, input.conversationId ?? undefined);
}

const ACTION_PRESSES = {
  confirm: confirmAction,
  decline: declineAction,
  undo: undoAction,
} as const;
export type ActionPress = keyof typeof ACTION_PRESSES;

const pressInput = z.strictObject({
  id: z.uuid(),
  press: z.enum(["confirm", "decline", "undo"]),
  details: taskDetails.optional(),
});

// The owner's own press on an action card: the only way a waiting action runs. A task
// card's Save carries the details its questions were answered with.
export async function pressActionAction(
  id: string,
  press: ActionPress,
  details?: Record<string, string>,
) {
  const owner = await requireOwner();
  const input = pressInput.parse({ id, press, details });
  const card =
    input.press === "confirm"
      ? await confirmAction(owner.id, input.id, input.details)
      : await ACTION_PRESSES[input.press](owner.id, input.id);
  if (card?.status === "done" || card?.status === "undone") revalidatePath("/", "layout");
  return card;
}
