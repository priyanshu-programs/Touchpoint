"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { BOARD_PAGE } from "@/lib/board-page";
import type { Paper } from "../../workflows/[id]/paper";
import {
  prepareWhiteboard,
  WhiteboardLoading,
} from "../../workflows/[id]/board-canvas";

// Never rendered on the server, and downloaded only by this page.
const BrainstormEditor = dynamic(
  async () => {
    prepareWhiteboard();
    return (await import("./brainstorm-editor")).BrainstormEditor;
  },
  { ssr: false, loading: WhiteboardLoading },
);

// A browser keeps the security policy of the page it first loaded, and only a
// board's own page may reach the live room. Arriving from another page inside the
// app, it would keep that page's policy and be refused.
const loadedElsewhere = () =>
  typeof window !== "undefined" &&
  !BOARD_PAGE.test(
    new URL(
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name,
    ).pathname,
  );

export function BrainstormCanvas({
  liveRoom,
  ...board
}: {
  boardId: string;
  name: string;
  paper: Paper;
  liveRoom: boolean;
}) {
  const [reloads] = useState(() => liveRoom && loadedElsewhere());
  useEffect(() => {
    if (reloads) window.location.reload();
  }, [reloads]);
  return reloads ? <WhiteboardLoading /> : <BrainstormEditor {...board} />;
}
