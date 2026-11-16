"use client";

import { ChatView, useChat, type ChatMessage } from "@/components/assistant/chat";

// A chat on a page of its own. A new one takes its address once it is kept, so a
// reload opens the same chat.
export function Conversation({
  conversationId,
  messages,
}: {
  conversationId?: string;
  messages?: ChatMessage[];
}) {
  const chat = useChat({
    conversationId,
    messages,
    onStarted: (id) => window.history.replaceState(null, "", `/assistant/${id}`),
  });
  return <ChatView chat={chat} className="h-[65dvh] min-h-80 rounded-xl border bg-card" />;
}
