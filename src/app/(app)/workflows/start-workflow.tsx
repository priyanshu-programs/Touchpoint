"use client";

import { Plus, SquareDashed } from "lucide-react";
import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardSubject } from "@/modules/workflows/schema";
import { startBlankBoardAction, startWorkflowAction } from "./actions";
import { TemplateForm } from "./template-form";

// Starts a workflow on the record whose panel this is: a copy of one of the
// owner's workflows, which then shows in the list beside it, or an empty board,
// which opens at once to be drawn on.
export function StartWorkflow({
  subject,
  templates,
}: {
  subject: BoardSubject;
  templates: { id: string; name: string }[];
}) {
  const [blank, setBlank] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = (templateId: string) =>
    startTransition(async () => {
      const result = await startWorkflowAction(subject, templateId);
      setRefusal(result?.ok ? null : (result?.message ?? null));
    });

  return (
    <div className="grid justify-items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Plus aria-hidden />
          {pending ? "Starting…" : "Start a workflow"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {templates.length > 0 && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Your workflows</DropdownMenuLabel>
                {templates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onClick={() => start(template.id)}
                  >
                    {template.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setBlank(true)}>
            <SquareDashed aria-hidden />
            Blank board…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}

      <Dialog open={blank} onOpenChange={setBlank}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blank board</DialogTitle>
            <DialogDescription>
              An empty whiteboard of this record&apos;s own. It opens as soon as
              it has a name.
            </DialogDescription>
          </DialogHeader>
          <TemplateForm
            action={startBlankBoardAction.bind(null, subject)}
            initial={{ name: "", description: "" }}
            submitLabel="Create board"
            onDone={() => setBlank(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
