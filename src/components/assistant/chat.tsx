"use client";

import { ArrowUp } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { DailyUse } from "@/ai/openrouter";
import { assistantUseAction } from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatEvent, ChatRefusal } from "@/modules/assistant/chat";
import { MAX_MESSAGE_CHARS } from "@/modules/assistant/schema";

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

const REFUSALS: Record<ChatRefusal, string> = {
  no_key: "Add your OpenRouter key in Settings, under Assistant, first.",
  unreadable:
    "Your key was saved with a different encryption key. Enter it again in Settings, under Assistant.",
  not_found: "This chat no longer exists. Start a new one.",
  rate: "That's a lot of messages in one minute. Wait a moment and try again.",
  too_many_chats: "You can keep at most 500 chats. Delete one you no longer need first.",
  chat_full: "This chat is full. Start a new one.",
};
const NOT_SENT = "That couldn't be sent. Check your connection and try again.";

// One JSON event a line, as the chat route writes them.
async function* eventsOf(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let held = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const lines = (held + decoder.decode(value, { stream: true })).split("\n");
    held = lines.pop() ?? "";
    for (const line of lines) if (line) yield JSON.parse(line) as ChatEvent;
  }
}

// A chat's state, held by whatever stays on screen: the app shell for the side panel,
// so a reply keeps arriving while the panel is closed.
export function useChat({
  conversationId: openedId = null,
  messages: opened = [],
  onStarted,
}: {
  conversationId?: string | null;
  messages?: ChatMessage[];
  // A new chat was kept under this id.
  onStarted?: (id: string) => void;
} = {}) {
  const [conversationId, setConversationId] = useState(openedId);
  const [messages, setMessages] = useState(opened);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyUse | null>(null);

  const loadUse = useCallback(async () => {
    const use = await assistantUseAction();
    if (use.state === "ready") setDaily(use.daily);
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setProblem(null);
    setSending(true);
    setMessages((all) => [
      ...all,
      { id: crypto.randomUUID(), role: "user", text },
      { id: crypto.randomUUID(), role: "assistant", text: "" },
    ]);

    let failure: string | null = null;
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(conversationId && { conversationId }) }),
      });
      if (!response.ok || !response.body) {
        const { reason } = await response.json().catch(() => ({ reason: undefined }));
        failure = REFUSALS[reason as ChatRefusal] ?? NOT_SENT;
      } else {
        for await (const event of eventsOf(response.body)) {
          if (event.type === "start") {
            if (!conversationId) onStarted?.(event.conversationId);
            setConversationId(event.conversationId);
          } else if (event.type === "text") {
            setMessages((all) => {
              const last = all[all.length - 1];
              return [...all.slice(0, -1), { ...last, text: last.text + event.text }];
            });
          } else {
            setDaily(event.daily);
            if (event.type === "error") failure = event.message;
          }
        }
      }
    } catch {
      failure = NOT_SENT;
    }
    // A reply that never began leaves no empty bubble behind.
    setMessages((all) => (all[all.length - 1].text ? all : all.slice(0, -1)));
    setProblem(failure);
    setSending(false);
  }

  function startOver() {
    setConversationId(null);
    setMessages([]);
    setProblem(null);
  }

  return { messages, draft, setDraft, sending, problem, daily, loadUse, send, startOver };
}

export function ChatView({
  chat,
  className,
}: {
  chat: ReturnType<typeof useChat>;
  className?: string;
}) {
  const { messages, draft, sending, problem, daily, loadUse } = chat;
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadUse();
  }, [loadUse]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, problem]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void chat.send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void chat.send();
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        role="log"
        aria-label="Chat"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Ask anything. The assistant can&apos;t see your companies, people or money yet,
            so it can only talk things through with you.
          </p>
        )}
        {messages.map((message, index) => (
          <p
            key={message.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 break-words whitespace-pre-wrap",
              message.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-muted",
            )}
          >
            <span className="sr-only">
              {message.role === "user" ? "You: " : "Assistant: "}
            </span>
            {message.text ||
              (sending && index === messages.length - 1 && (
                <span className="text-muted-foreground">Thinking…</span>
              ))}
          </p>
        ))}
        {problem && (
          <p role="alert" className="text-destructive">
            {problem}
          </p>
        )}
        <div ref={end} />
      </div>

      <form onSubmit={onSubmit} className="grid gap-2 border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Message the assistant"
            placeholder="Message the assistant…"
            value={draft}
            onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            className="max-h-40 min-h-10"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={sending || !draft.trim()}
          >
            <ArrowUp aria-hidden />
          </Button>
        </div>
        <p className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
          <span>
            {daily
              ? `${daily.remaining} of ${daily.limit} free requests left today`
              : "A free model may keep what you type."}
          </span>
          <Link href="/settings/assistant" className="underline">
            Assistant settings
          </Link>
        </p>
      </form>
    </div>
  );
}
