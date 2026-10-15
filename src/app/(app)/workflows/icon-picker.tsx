"use client";

import { startTransition, useOptimistic } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isWorkflowIcon, WORKFLOW_ICONS } from "@/modules/workflows/icons";
import { iconLabel, WorkflowIconGlyph } from "./workflow-icon";

// The icon a workflow is marked with, changed from a grid where it is shown.
export function IconPicker({
  name,
  icon,
  action,
}: {
  name: string;
  icon: string | null;
  action: (icon: string | null) => Promise<void>;
}) {
  const [shown, show] = useOptimistic(icon);
  const choose = (next: string | null) =>
    startTransition(async () => {
      show(next);
      await action(next);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          isWorkflowIcon(shown)
            ? `Icon of ${name}: ${iconLabel(shown)}`
            : `Choose an icon for ${name}`
        }
        className={cn(
          "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border hover:bg-accent",
          isWorkflowIcon(shown)
            ? "bg-card text-foreground"
            : "border-dashed text-muted-foreground",
        )}
      >
        <WorkflowIconGlyph icon={shown} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto">
        <div className="grid grid-cols-6 gap-0.5">
          {WORKFLOW_ICONS.map((key) => (
            <DropdownMenuItem
              key={key}
              aria-label={iconLabel(key)}
              title={iconLabel(key)}
              onClick={() => choose(key)}
              className={cn(
                "size-9 justify-center p-0",
                key === shown && "bg-primary/15 text-primary",
              )}
            >
              <WorkflowIconGlyph icon={key} className="size-4" />
            </DropdownMenuItem>
          ))}
        </div>
        {isWorkflowIcon(shown) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => choose(null)}>No icon</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
