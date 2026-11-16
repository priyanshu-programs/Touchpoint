import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { assistantSettings } from "@/modules/assistant/service";
import { Conversation } from "../conversation";

export const metadata: Metadata = { title: "New chat" };

export default async function NewChatPage() {
  const owner = await requireOwner();
  if ((await assistantSettings(owner.id)).key !== "ready") redirect("/assistant");

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
        <h1 className="text-2xl font-semibold tracking-tight">New chat</h1>
      </div>
      <Conversation />
    </div>
  );
}
