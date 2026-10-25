import type { CSSProperties, Ref } from "react";
import type { StickyNote } from "@/modules/workflows/sticky";

const placed = ({ x, y, width, height, angle }: StickyNote): CSSProperties => ({
  left: x,
  top: y,
  width,
  height,
  transform: `rotate(${angle}rad)`,
});

// The shadow under each sticky note. The whiteboard draws on a canvas, where a
// box casts no shadow, so the shadows are a layer of their own under the
// canvases, as the stage glows are, moved and scaled with the drawing through
// `layer`.
export function StickyShadows({
  layer,
  notes,
  dark,
}: {
  layer: Ref<HTMLDivElement>;
  notes: readonly StickyNote[];
  dark: boolean;
}) {
  return (
    <div aria-hidden className="sticky-shadows" data-dark={dark || undefined}>
      <div ref={layer} className="sticky-layer">
        {notes.map((note) => (
          <div key={note.id} className="sticky-shadow" style={placed(note)} />
        ))}
      </div>
    </div>
  );
}

// A faint shading over each note, in a layer over the canvases that takes no
// pointer. In the dark theme the whiteboard draws everything through a filter
// that turns a yellow note olive; the layer undoes that filter over each note,
// so the note, its text and what is drawn on it show as in the light theme.
export function StickySheen({
  layer,
  notes,
  dark,
}: {
  layer: Ref<HTMLDivElement>;
  notes: readonly StickyNote[];
  dark: boolean;
}) {
  return (
    <div aria-hidden className="sticky-sheen" data-dark={dark || undefined}>
      <div ref={layer} className="sticky-layer">
        {notes.map((note) => (
          <div key={note.id} className="sticky-shine" style={placed(note)} />
        ))}
      </div>
    </div>
  );
}
