"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DailyUse } from "@/ai/openrouter";
import { assistantUseAction, quickAnswerAction } from "@/app/(app)/assistant/actions";
import { Conversation, ConversationContent } from "@/components/ui/chatcn/conversation";
import { Message, MessageContent } from "@/components/ui/chatcn/message";
import {
  PromptInput,
  PromptInputActions,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ui/chatcn/prompt-input";
import { ScrollToBottom } from "@/components/ui/chatcn/scroll-to-bottom";
import { Suggestion, Suggestions } from "@/components/ui/chatcn/suggestions";
import { cn } from "@/lib/utils";
import type { ActionCard } from "@/modules/assistant/actions";
import type { ChatEvent, ChatRefusal } from "@/modules/assistant/chat";
import type { QuickAsk } from "@/modules/assistant/quick";
import type { RecordLink } from "@/modules/assistant/read";
import { MAX_MESSAGE_CHARS } from "@/modules/assistant/schema";
import { ActionCardView } from "./action-card";
import { ReplyText } from "./reply-text";
import { ThinkingBall } from "./thinking-ball";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  links?: RecordLink[];
  actions?: ActionCard[];
};

const QUICK: { ask: QuickAsk; label: string }[] = [
  { ask: "today", label: "What's on today?" },
  { ask: "due", label: "What's overdue or due today?" },
  { ask: "money", label: "How's money this month?" },
];

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

// Only this app's own pages: the server builds these, and nothing else is ever a link.
const ownPage = (href: string) => href.startsWith("/") && !href.startsWith("//");

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
  const [looking, setLooking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyUse | null>(null);

  const loadUse = useCallback(async () => {
    const use = await assistantUseAction();
    if (use.state === "ready") setDaily(use.daily);
  }, []);

  const toLast = (change: (last: ChatMessage) => ChatMessage) =>
    setMessages((all) => [...all.slice(0, -1), change(all[all.length - 1])]);

  function started(id: string) {
    if (!conversationId) onStarted?.(id);
    setConversationId(id);
  }

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
            started(event.conversationId);
          } else if (event.type === "looking") {
            setLooking(event.at);
          } else if (event.type === "text") {
            setLooking(null);
            toLast((last) => ({ ...last, text: last.text + event.text }));
          } else if (event.type === "links") {
            toLast((last) => ({ ...last, links: event.links }));
          } else if (event.type === "actions") {
            toLast((last) => ({ ...last, actions: event.cards }));
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
    setMessages((all) => {
      const last = all[all.length - 1];
      return last.text || last.actions?.length ? all : all.slice(0, -1);
    });
    setLooking(null);
    setProblem(failure);
    setSending(false);
  }

  async function quick(ask: QuickAsk) {
    if (sending) return;
    setProblem(null);
    setSending(true);
    try {
      const result = await quickAnswerAction(ask, conversationId);
      if (result.ok) {
        started(result.conversationId);
        setMessages((all) => [
          ...all,
          { id: crypto.randomUUID(), role: "user", text: QUICK.find((q) => q.ask === ask)!.label },
          { id: crypto.randomUUID(), role: "assistant", text: result.text, links: result.links },
        ]);
      } else {
        setProblem(REFUSALS[result.reason]);
      }
    } catch {
      setProblem(NOT_SENT);
    }
    setSending(false);
  }

  function startOver() {
    setConversationId(null);
    setMessages([]);
    setProblem(null);
  }

  return {
    messages,
    draft,
    setDraft,
    sending,
    looking,
    problem,
    daily,
    loadUse,
    send,
    quick,
    startOver,
  };
}

export function ChatView({
  chat,
  onOpenRecord,
  className,
}: {
  chat: ReturnType<typeof useChat>;
  // A link to a record was followed, so a panel over the page can close.
  onOpenRecord?: () => void;
  className?: string;
}) {
  const { messages, draft, sending, looking, problem, daily, loadUse } = chat;

  useEffect(() => {
    void loadUse();
  }, [loadUse]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <Conversation className="flex-1">
        <ConversationContent label="Chat" className="max-w-none gap-5 px-4 pt-5 pb-4 sm:px-5">
          {messages.length === 0 && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Ask about a person or company by name, your tasks, meetings or money. These
                answer at once and use no free requests:
              </p>
              <Suggestions variant="rows" label="Quick questions">
                {QUICK.map(({ ask, label }) => (
                  <Suggestion key={ask} disabled={sending} onSelect={() => void chat.quick(ask)}>
                    {label}
                  </Suggestion>
                ))}
              </Suggestions>
            </div>
          )}
          {messages.map((message, index) => {
            const waiting = sending && index === messages.length - 1;
            const cards = message.actions ?? [];
            if (message.role === "assistant" && !message.text && cards.length === 0) {
              return waiting ? (
                <ThinkingBall
                  key={message.id}
                  label={looking ? `Looking at ${looking}…` : "Thinking…"}
                />
              ) : null;
            }
            return (
              <Message
                key={message.id}
                from={message.role}
                state={waiting ? "streaming" : "done"}
                latest={index === messages.length - 1}
              >
                {(message.role === "user" || message.text) && (
                  <MessageContent
                    className={cn(
                      "chatcn-text-14",
                      message.role === "user"
                        ? "max-w-[85%] bg-primary whitespace-pre-wrap text-primary-foreground"
                        : "max-w-none",
                    )}
                  >
                    <span className="sr-only">
                      {message.role === "user" ? "You: " : "Assistant: "}
                    </span>
                    {message.role === "user" ? message.text : <ReplyText text={message.text} />}
                  </MessageContent>
                )}
                {cards.length > 0 && (
                  <div className="grid w-full gap-2">
                    {cards.map((card) => (
                      <ActionCardView key={card.id} card={card} onOpen={onOpenRecord} />
                    ))}
                  </div>
                )}
                {message.links && message.links.length > 0 && (
                  <nav aria-label="Records used" className="flex flex-wrap gap-1.5 text-xs">
                    {message.links.filter(({ href }) => ownPage(href)).map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={onOpenRecord}
                        className="rounded-full border px-2.5 py-1 break-words text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                )}
              </Message>
            );
          })}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </ConversationContent>
        <ScrollToBottom />
      </Conversation>

      <div className="grid gap-2 border-t p-3">
        <PromptInput
          value={draft}
          onValueChange={chat.setDraft}
          onSubmit={() => void chat.send()}
          status={sending ? "submitting" : "idle"}
        >
          <PromptInputTextarea
            aria-label="Message the assistant"
            placeholder="Message the assistant…"
            maxLength={MAX_MESSAGE_CHARS}
          />
          <PromptInputToolbar>
            <PromptInputTools />
            <PromptInputActions>
              <PromptInputSubmit labels={{ send: "Send" }} />
            </PromptInputActions>
          </PromptInputToolbar>
        </PromptInput>
        <p className="flex flex-wrap justify-between gap-x-4 px-1 text-xs text-muted-foreground">
          <span>
            {daily
              ? `${daily.remaining} of ${daily.limit} free requests left today`
              : "A free model may keep what you type."}
          </span>
          <Link href="/settings/assistant" className="underline">
            Assistant settings
          </Link>
        </p>
      </div>
    </div>
  );
}
