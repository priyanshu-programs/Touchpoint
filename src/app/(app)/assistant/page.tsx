import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ButtonLink } from "@/components/button-link";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import {
  CONVERSATIONS_PER_PAGE,
  listConversations,
} from "@/modules/assistant/conversations";
import { assistantSettings } from "@/modules/assistant/service";
import { getSettings } from "@/modules/settings/service";
import { ListFooter } from "../people/(lists)/list-card";
import { DeleteChat } from "./delete-chat";

export const metadata: Metadata = { title: "Assistant" };

const pageParam = z.coerce.number().int().min(1).max(1000).catch(1);

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const owner = await requireOwner();
  const page = pageParam.parse((await searchParams).page);
  const [{ rows, total }, assistant, settings] = await Promise.all([
    listConversations(owner.id, page),
    assistantSettings(owner.id),
    getSettings(owner.id),
  ]);
  const timezone = settings?.timezone ?? "UTC";
  const ready = assistant.key === "ready";
  const first = (page - 1) * CONVERSATIONS_PER_PAGE + 1;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
          <p className="text-muted-foreground">
            Your chats with the assistant, the latest first.
          </p>
        </div>
        {ready && <ButtonLink href="/assistant/new">New chat</ButtonLink>}
      </div>

      {!ready && (
        <p className="text-sm">
          The assistant isn&apos;t set up yet.{" "}
          <Link href="/settings/assistant" className="font-medium underline">
            Add your OpenRouter key in Settings
          </Link>{" "}
          to start a chat.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {page > 1 ? "No chats on this page." : "No chats yet."}
        </p>
      ) : (
        <div className="grid gap-4">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map(({ id, title, updatedAt }) => (
              <li key={id} className="flex items-center gap-3 px-4 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <Link
                    href={`/assistant/${id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(updatedAt, timezone)}
                  </span>
                </div>
                <DeleteChat id={id} title={title} />
              </li>
            ))}
          </ul>
          <ListFooter first={first} shown={rows.length} total={total}>
            <div className="flex gap-4">
              {page > 1 && (
                <Link href={`/assistant?page=${page - 1}`} className="underline">
                  Previous page
                </Link>
              )}
              {first + rows.length - 1 < total && (
                <Link href={`/assistant?page=${page + 1}`} className="underline">
                  Next page
                </Link>
              )}
            </div>
          </ListFooter>
        </div>
      )}
    </div>
  );
}
