import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// The question the whiteboard puts beside a shape just drawn with the pen. It
// stands at a point of the drawing (`x`, `y`: the middle of the shape's top
// edge, or of its foot when there is no room above) and keeps its own size at
// any zoom (board.css). It never takes the keyboard from the whiteboard, so
// drawing on is all it takes to leave it unanswered.
export function StageAsk({
  x,
  y,
  below,
  onYes,
  onNo,
}: {
  x: number;
  y: number;
  below: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onNo();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onNo]);

  return (
    <div
      role="group"
      aria-label="Make this a stage?"
      className="stage-ask"
      data-below={below || undefined}
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-1 rounded-full bg-card py-1 pr-1 pl-3 text-sm whitespace-nowrap text-card-foreground shadow-lg ring-1 ring-foreground/10">
        <span className="pr-1">Make this a stage?</span>
        <Button size="sm" onClick={onYes}>
          Yes
        </Button>
        <Button size="sm" variant="ghost" onClick={onNo}>
          No
        </Button>
      </div>
    </div>
  );
}
