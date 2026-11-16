import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getConversation } from "@/modules/assistant/conversations";
import { Conversation } from "../conversation";
import { DeleteChat } from "../delete-chat";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: PageProps<"/assistant/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  const conversation = id.success ? await getConversation(owner.id, id.data) : null;
  if (!conversation) notFound();

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <nav aria-label="Breadcrumb">
          <Link
            href="/assistant"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Assistant
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
            {conversation.title}
          </h1>
          <DeleteChat id={conversation.id} title={conversation.title} />
        </div>
      </div>
      <Conversation conversationId={conversation.id} messages={conversation.messages} />
    </div>
  );
}
