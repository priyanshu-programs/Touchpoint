import type { Ref } from "react";
import type { BoxKind } from "@/modules/workflows/drawing";
import { KindIcon } from "./kind-icons";

// A box that carries links, files or notes: how many of each kind, and where its
// top right corner is in the drawing. `version` is the whiteboard's own count of
// changes to the box.
export type BoxMark = {
  id: string;
  version: number;
  kinds: { kind: BoxKind; count: number }[];
  x: number;
  y: number;
};

// An icon for each kind a box carries above its corner, with a count where
// there are several. A layer under the canvases, as the glows are, so it never
// comes between the pointer and the drawing; the whiteboard moves and scales it
// with the drawing through `layer`, and each mark keeps its own size (board.css).
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
            className="box-mark inline-flex items-center gap-2 rounded-full bg-card px-2 py-1 text-xs font-medium text-card-foreground shadow-sm ring-1 ring-foreground/15"
            style={{ left: mark.x, top: mark.y }}
          >
            {mark.kinds.map(({ kind, count }) => (
              <span
                key={kind}
                data-kind={kind}
                className="inline-flex items-center gap-0.5"
              >
                <KindIcon kind={kind} className="size-3.5" />
                {count > 1 && count}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
