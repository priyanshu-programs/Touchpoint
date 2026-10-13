import { Button } from "@/components/ui/button";
import type { StageStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  STAGE_LABELS,
  STAGE_MARKS,
  STAGE_ORDER,
} from "@/modules/workflows/drawing";

// What the selected box is to the workflow. It floats over the whiteboard, clear
// of the whiteboard's own controls: under them at the right on a wide screen,
// above the bar along the foot of a phone. On a record's own board a stage also
// says how far it has got; on a workflow that is only drawn, it has no status.
export function BoxCard({
  status,
  tracked,
  onChange,
}: {
  // Nothing when the box is not a stage.
  status: StageStatus | null;
  tracked: boolean;
  onChange: (status: StageStatus | null) => void;
}) {
  return (
    <section
      aria-label="Selected box"
      className="absolute inset-x-3 bottom-20 z-10 grid gap-2 rounded-xl bg-card p-4 text-sm text-card-foreground shadow-lg ring-1 ring-foreground/10 sm:inset-x-auto sm:top-16 sm:right-3 sm:bottom-auto sm:w-60"
    >
      <p className="text-muted-foreground">
        {status
          ? "This box is a stage of the workflow, named by the text inside it."
          : "A stage is a step a client goes through. Its name is the text inside the box."}
      </p>
      {status && tracked && (
        <div role="group" aria-label="Status" className="grid grid-cols-2 gap-1">
          {STAGE_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => onChange(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground",
                status === value && "border-foreground font-medium text-foreground",
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_MARKS[value] }}
              />
              {STAGE_LABELS[value]}
            </button>
          ))}
        </div>
      )}
      <Button
        variant={status ? "outline" : "default"}
        size="sm"
        className="justify-self-start"
        onClick={() => onChange(status ? null : "not_started")}
      >
        {status ? "Not a stage" : "Make this a stage"}
      </Button>
    </section>
  );
}
