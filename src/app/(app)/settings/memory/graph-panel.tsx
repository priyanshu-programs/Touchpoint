"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphLink, GraphNode } from "@/modules/memory/graph";
import { MemoryGraph } from "./memory-graph";
import { MemoryRow, type MemoryLimits, type MemoryRowData } from "./memory-forms";

// The graph, and under it whatever dot was picked: a memory to change or delete, or the
// person or company to open.
export function GraphPanel({
  nodes,
  links,
  matches,
  memories,
  hrefs,
  limits,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  matches: string[] | null;
  memories: Record<string, MemoryRowData>;
  hrefs: Record<string, string>;
  limits: MemoryLimits;
}) {
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const found = useMemo(() => (matches ? new Set(matches) : null), [matches]);
  // A memory deleted from its row leaves the graph; nothing stays picked.
  const current = picked && nodes.some((node) => node.id === picked.id) ? picked : null;
  const memory = current?.kind === "memory" ? memories[current.id] : null;
  const href = current?.recordId ? hrefs[current.id] : null;

  return (
    <div className="grid gap-3">
      <MemoryGraph
        nodes={nodes}
        links={links}
        matches={found}
        selected={current?.id ?? null}
        onSelect={setPicked}
      />
      <p className="text-xs text-muted-foreground">
        Drag to move around, scroll or use the buttons to zoom, and pick a dot to see it.
        Faint violet lines join memories that share a word.
      </p>
      {memory && <MemoryRow key={memory.id} memory={memory} limits={limits} />}
      {current && current.kind !== "memory" && (
        <p className="text-sm">
          <span className="font-medium">{current.label}</span>
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
    </div>
  );
}
