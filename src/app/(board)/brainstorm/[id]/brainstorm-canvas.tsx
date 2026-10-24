"use client";

import dynamic from "next/dynamic";
import {
  prepareWhiteboard,
  WhiteboardLoading,
} from "../../workflows/[id]/board-canvas";

// Never rendered on the server, and downloaded only by this page.
export const BrainstormCanvas = dynamic(
  async () => {
    prepareWhiteboard();
    return (await import("./brainstorm-editor")).BrainstormEditor;
  },
  { ssr: false, loading: WhiteboardLoading },
);
