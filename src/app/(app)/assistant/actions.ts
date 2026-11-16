"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { deleteConversation } from "@/modules/assistant/conversations";
import { QUICK_ASKS, quickAnswer, type QuickAsk } from "@/modules/assistant/quick";
import { assistantUse } from "@/modules/assistant/service";

// Today's free requests, for the line under the message box.
export async function assistantUseAction() {
  const owner = await requireOwner();
  return assistantUse(owner.id);
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
