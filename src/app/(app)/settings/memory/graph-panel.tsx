"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GraphLink, GraphNode } from "@/modules/memory/graph";
import { MemoryGraph } from "./memory-graph";
import { MemoryRow, type MemoryLimits, type MemoryRowData } from "./memory-forms";

// The graph, and under it whatever dot was picked: a memory to change or delete, or the
// person or company to open. Full screen, the graph fills the window and the pick floats on it.
export function GraphPanel({
  nodes,
  links,
  matches,
  memories,
  hrefs,
  limits,
  centreOn = null,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  matches: string[] | null;
  memories: Record<string, MemoryRowData>;
  hrefs: Record<string, string>;
  limits: MemoryLimits;
  centreOn?: string | null;
}) {
  const [picked, setPicked] = useState<GraphNode | null>(
    () => nodes.find((node) => node.id === centreOn) ?? null,
  );
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const found = useMemo(() => (matches ? new Set(matches) : null), [matches]);
  // A memory deleted from its row leaves the graph; nothing stays picked.
  const current = picked && nodes.some((node) => node.id === picked.id) ? picked : null;
  const memory = current?.kind === "memory" ? memories[current.id] : null;
  const href = current?.recordId ? hrefs[current.id] : null;
  const hollow = nodes.some((node) => node.hollow);

  // Focus inside, so Escape reaches it; a layout effect, before a record panel takes focus back.
  useLayoutEffect(() => {
    if (full) box.current?.focus();
  }, [full]);

  const pick = (
    <>
      {memory && <MemoryRow key={memory.id} memory={memory} limits={limits} />}
      {current && current.kind !== "memory" && (
        <p className={cn("text-sm", full && "rounded-md border bg-card p-3")}>
          <span className="font-medium">{current.label}</span>
          {current.hollow && (
            <span className="text-muted-foreground"> · nothing remembered yet</span>
          )}
          {href && (
            <>
              {" · "}
              <Link href={href} className="underline">
                Open
              </Link>
            </>
          )}
        </p>
      )}
    </>
  );

  return (
    <div
      ref={box}
      // Escape here leaves full screen and doesn't close the record panel the graph is in.
      data-inline-editor={full ? "" : undefined}
      tabIndex={full ? -1 : undefined}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? "Memory graph, full screen" : undefined}
      onKeyDown={(event) => {
        if (full && event.key === "Escape") {
          event.stopPropagation();
          setFull(false);
        }
      }}
      className={full ? "fixed inset-0 z-50 bg-[#0b0d10] outline-none" : "grid gap-3"}
    >
      <MemoryGraph
        nodes={nodes}
        links={links}
        matches={found}
        selected={current?.id ?? null}
        onSelect={setPicked}
        full={full}
        onFull={() => setFull((now) => !now)}
        centreOn={centreOn}
      />
      {full ? (
        (memory || current) && (
          <div className="absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] mx-auto max-h-[45%] max-w-xl overflow-y-auto">
            {pick}
          </div>
        )
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Drag to move around, scroll or use the buttons to zoom, and pick a dot to see it.
            Faint violet lines join memories that share a word.
            {hollow && " Hollow dots are people the assistant knows nothing about yet."}
          </p>
          {pick}
        </>
      )}
    </div>
  );
}
