"use client";

import dynamic from "next/dynamic";

const CDN = "url(https://esm.sh/";

// The whiteboard lists a copy of every font on a CDN after this app's own. The
// font policy refuses them, but each refusal is an error in the console, a few
// hundred a visit, so the CDN's copies are taken off the list before a font is made.
function keepFontsHere() {
  const Native = window.FontFace;
  if (Native.name === "OwnFontFace") return;
  window.FontFace = class OwnFontFace extends Native {
    constructor(
      family: string,
      source: string | BufferSource,
      descriptors?: FontFaceDescriptors,
    ) {
      super(
        family,
        typeof source === "string"
          ? source
              .split(", ")
              .filter((from) => !from.startsWith(CDN))
              .join(", ")
          : source,
        descriptors,
      );
    }
  };
}

// The whiteboard reads the window as it loads, so it is never rendered on the
// server, and only this page ever downloads it.
export const BoardCanvas = dynamic(
  async () => {
    keepFontsHere();
    // Its fonts are served by this app (scripts/copy-board-fonts.mjs).
    (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
      "/excalidraw/";
    return (await import("./board-editor")).BoardEditor;
  },
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-sm text-muted-foreground">Opening the whiteboard…</p>
    ),
  },
);
