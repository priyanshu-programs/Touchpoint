"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Graph or List in a record's Memory tab; the list is the text view, and the easier one on a phone.
export function MemoryViews({ graph, list }: { graph: ReactNode; list: ReactNode }) {
  const [view, setView] = useState<"graph" | "list">("graph");
  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Memory view" className="flex gap-2 text-sm">
        {(["graph", "list"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={cn(
              "rounded-md border px-2 py-1 text-muted-foreground",
              view === option && "bg-muted font-medium text-foreground",
            )}
          >
            {option === "graph" ? "Graph" : "List"}
          </button>
        ))}
      </div>
      {view === "graph" ? graph : list}
    </div>
  );
}
