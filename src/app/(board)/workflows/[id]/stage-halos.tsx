import type { CSSProperties, Ref } from "react";
import type { StageStatus } from "@/db/schema";
import { STAGE_MARKS, type STAGE_SHAPES } from "@/modules/workflows/drawing";

// Where a stage's box is in the drawing. `version` is the whiteboard's own
// count of changes to the box, which tells one drawing of it from the next.
export type StageBox = {
  id: string;
  version: number;
  shape: (typeof STAGE_SHAPES)[number];
  status: StageStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

// A soft glow behind every stage. The whiteboard draws on a canvas, where one
// box cannot be made to glow, so the glows are a layer of their own under the
// canvases, as the dotted grid is. Each is placed where its box is drawn, and
// the whiteboard moves and scales the whole layer with the drawing through
// `layer`. The colours are this app's own, never one kept in a drawing.
export function StageHalos({
  layer,
  stages,
  tracked,
}: {
  layer: Ref<HTMLDivElement>;
  stages: readonly StageBox[];
  // A record's board, where the glow says how far the stage has got.
  tracked: boolean;
}) {
  return (
    <div aria-hidden className="stage-halos">
      <div ref={layer} className="stage-halos-layer">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="stage-halo"
            data-shape={stage.shape}
            style={
              {
                left: stage.x,
                top: stage.y,
                width: stage.width,
                height: stage.height,
                transform: `rotate(${stage.angle}rad)`,
                "--halo": tracked ? STAGE_MARKS[stage.status] : "var(--primary)",
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
