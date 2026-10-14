import { Paperclip } from "lucide-react";
import type { Ref } from "react";

// A box that carries links or files: how many, and where its top right corner
// is in the drawing. `version` is the whiteboard's own count of changes to the box.
export type BoxMark = {
  id: string;
  version: number;
  count: number;
  x: number;
  y: number;
};

// A paperclip and a count above the corner of every box that carries something.
// A layer under the canvases, as the glows are, so it never comes between the
// pointer and the drawing; the whiteboard moves and scales it with the drawing
// through `layer`, and each mark keeps its own size (board.css).
export function BoxMarks({
  layer,
  marks,
}: {
  layer: Ref<HTMLDivElement>;
  marks: readonly BoxMark[];
}) {
  return (
    <div aria-hidden className="box-marks">
      <div ref={layer} className="box-marks-layer">
        {marks.map((mark) => (
          <span
            key={mark.id}
            className="box-mark inline-flex items-center gap-0.5 rounded-full bg-card px-1.5 py-0.5 text-[11px] font-medium text-card-foreground shadow-sm ring-1 ring-foreground/15"
            style={{ left: mark.x, top: mark.y }}
          >
            <Paperclip className="size-3" />
            {mark.count}
          </span>
        ))}
      </div>
    </div>
  );
}
