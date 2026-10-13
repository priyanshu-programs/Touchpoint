import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getBoard } from "@/modules/workflows/queries";
import { BoardCanvas } from "./board-canvas";
import { BoardMenu } from "./board-menu";

export const metadata: Metadata = { title: "Workflow" };

export default async function BoardPage({
  params,
}: PageProps<"/workflows/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const board = await getBoard(owner.id, id.data);
  if (!board) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3">
        <Link
          href="/workflows"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Workflows
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold tracking-tight">
          {board.name}
        </h1>
        <BoardMenu
          id={board.id}
          name={board.name}
          description={board.description ?? ""}
        />
      </header>
      <main className="relative min-h-0 flex-1">
        <BoardCanvas
          // Another workflow needs a whiteboard of its own, not this one's state.
          key={board.id}
          boardId={board.id}
          name={board.name}
        />
      </main>
    </div>
  );
}
