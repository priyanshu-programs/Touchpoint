"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { pressActionAction, type ActionPress } from "@/app/(app)/assistant/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AiActionStatus, AiActionTool } from "@/db/schema";
import { cn } from "@/lib/utils";
import type { ActionCard } from "@/modules/assistant/actions";
import { TaskQuestions } from "./task-questions";

const HEADINGS: Record<AiActionTool, Partial<Record<AiActionStatus, string>>> = {
  addTask: { waiting: "New task", done: "Task added", undone: "Task removed", declined: "Task not added" },
  addNote: { waiting: "Add this note?", done: "Note added", undone: "Note removed", declined: "Note not added" },
  saveMemory: { waiting: "Remember this?", done: "Remembered", undone: "Forgotten", declined: "Not remembered" },
  scheduleMeeting: { waiting: "Schedule this meeting?", done: "Meeting scheduled", declined: "Not scheduled" },
  moveMeeting: { waiting: "Move this meeting?", done: "Meeting moved", declined: "Not moved" },
  cancelMeeting: { waiting: "Cancel this meeting?", done: "Meeting cancelled", declined: "Not cancelled" },
};

const CONFIRM: Record<AiActionTool, string> = {
  addTask: "Add task",
  addNote: "Add note",
  saveMemory: "Remember",
  scheduleMeeting: "Schedule",
  moveMeeting: "Move",
  cancelMeeting: "Cancel meeting",
};

const NOT_SENT = "That didn't go through. Check your connection and try again.";

// What the assistant did or asks to do. Only a press here runs a waiting action.
export function ActionCardView({
  card: given,
  onOpen,
}: {
  card: ActionCard;
  onOpen?: () => void;
}) {
  const [card, setCard] = useState(given);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = HEADINGS[card.tool][card.status] ?? "";

  const press = (which: ActionPress, details?: Record<string, string>) =>
    start(async () => {
      setProblem(null);
      try {
        const next = await pressActionAction(card.id, which, details);
        if (next) setCard(next);
      } catch {
        setProblem(NOT_SENT);
      }
    });

  const settled = card.status === "declined" || card.status === "undone";
  return (
    <section
      aria-label={heading}
      className={cn(
        "grid gap-2 rounded-md border bg-card p-3 text-sm",
        card.status === "waiting" && "border-primary",
        settled && "text-muted-foreground",
      )}
    >
      <h3 className="font-medium">{heading}</h3>
      <p className={cn(settled && "line-through")}>{card.summary}</p>
      {(problem ?? card.problem) && card.status === "waiting" && (
        <p role="alert" className="text-destructive">
          {problem ?? card.problem}
        </p>
      )}
      {card.status === "waiting" && card.task && card.task.ask.length > 0 && (
        <TaskQuestions
          draft={card.task}
          pending={pending}
          onSave={(details) => press("confirm", details)}
        />
      )}
      {card.status === "waiting" && (
        <div className="flex flex-wrap gap-2">
          {!(card.task && card.task.ask.length > 0) && (
            <Button type="button" size="sm" disabled={pending} onClick={() => press("confirm")}>
              {CONFIRM[card.tool]}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => press("decline")}
          >
            Not now
          </Button>
        </div>
      )}
      {card.status === "done" && (card.href || card.canUndo) && (
        <div className="flex flex-wrap items-center gap-2">
          {card.href && (
            <Link
              href={card.href}
              onClick={onOpen}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open
            </Link>
          )}
          {card.canUndo && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => press("undo")}
            >
              Undo
            </Button>
          )}
        </div>
      )}
      {problem && card.status !== "waiting" && (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      )}
    </section>
  );
}
