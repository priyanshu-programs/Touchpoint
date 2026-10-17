import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { boardSubjectOf, getBoard } from "@/modules/workflows/queries";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { BoardCanvas } from "./board-canvas";
import { BoardMenu } from "./board-menu";
import { PAPER_COOKIE, paperOf } from "./paper";

export const metadata: Metadata = { title: "Workflow" };

export default async function BoardPage({
  params,
}: PageProps<"/workflows/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const board = await getBoard(owner.id, id.data);
  if (!board) notFound();
  // A record's own board leads back to that record; a workflow, to the list.
  const subject = await boardSubjectOf(owner.id, board);
  const back = subject
    ? {
        href:
          subject.kind === "organization"
            ? companyHref(subject.id, "workflows")
            : contactHref(subject.id, "workflows"),
        label: subject.name,
      }
    : { href: "/workflows", label: "Workflows" };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
        >
          T
        </span>
        <Link
          href={back.href}
          className="inline-flex max-w-[40%] shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{back.label}</span>
        </Link>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <h1 className="min-w-0 flex-1 truncate font-semibold tracking-tight">
          {board.name}
        </h1>
        <BoardMenu
          id={board.id}
          name={board.name}
          description={board.description ?? ""}
        />
      </header>
      <main className="relative min-h-0 flex-1 bg-background">
        <BoardCanvas
          // Another workflow needs a whiteboard of its own, not this one's state.
          key={board.id}
          boardId={board.id}
          name={board.name}
          record={subject}
          paper={paperOf((await cookies()).get(PAPER_COOKIE)?.value)}
        />
      </main>
    </div>
  );
}
