import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConversations, aiMessages, type AiMessagePart } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { cardsOf } from "./actions";

export const CONVERSATIONS_PER_PAGE = 30;
export const MAX_CONVERSATIONS = 500;
export const MAX_MESSAGES = 200;

export const textOf = (parts: AiMessagePart[]) =>
  parts.map((part) => (part.type === "text" ? part.text : "")).join("");

export const linksOf = (parts: AiMessagePart[]) =>
  parts.flatMap((part) => (part.type === "links" ? part.links : []));

const actionIdsOf = (parts: AiMessagePart[]) =>
  parts.flatMap((part) => (part.type === "actions" ? part.ids : []));

const own = (ownerId: string, id: string) =>
  and(eq(aiConversations.ownerId, ownerId), eq(aiConversations.id, id));

// The owner's chats, the one written in last first.
export async function listConversations(ownerId: string, page = 1) {
  const [rows, total] = await Promise.all([
    db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .where(eq(aiConversations.ownerId, ownerId))
      .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id))
      .limit(CONVERSATIONS_PER_PAGE)
      .offset((page - 1) * CONVERSATIONS_PER_PAGE),
    db.$count(aiConversations, eq(aiConversations.ownerId, ownerId)),
  ]);
  return { rows, total };
}

export async function getConversation(ownerId: string, id: string) {
  const [conversation] = await db
    .select({ id: aiConversations.id, title: aiConversations.title })
    .from(aiConversations)
    .where(own(ownerId, id));
  if (!conversation) return null;
  const messages = await db
    .select({ id: aiMessages.id, role: aiMessages.role, parts: aiMessages.parts })
    .from(aiMessages)
    .where(and(eq(aiMessages.ownerId, ownerId), eq(aiMessages.conversationId, id)))
    .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id))
    .limit(MAX_MESSAGES);
  const cards = await cardsOf(ownerId, messages.flatMap(({ parts }) => actionIdsOf(parts)));
  return {
    ...conversation,
    messages: messages.map(({ id, role, parts }) => {
      const ids = actionIdsOf(parts);
      return {
        id,
        role,
        text: textOf(parts),
        links: linksOf(parts),
        actions: cards.filter((card) => ids.includes(card.id)),
      };
    }),
  };
}

export async function deleteConversation(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(aiConversations)
      .where(own(ownerId, id))
      .returning({ title: aiConversations.title });
    if (!removed) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "assistant.conversation_delete",
      entityType: "ai_conversation",
      entityId: id,
      before: removed,
    });
    return true;
  });
}
