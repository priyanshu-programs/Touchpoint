"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type Bar = {
  key: string;
  // Under the bar, and in its tooltip.
  axisLabel: string;
  label: string;
  value: number;
  text: string;
  detail: string;
  href: string;
};

// One column per bar from a shared baseline, the scale's top at `max`. The table beside
// it holds the same numbers and links for screen readers and keyboards, so the chart is
// hidden from them and its bars only answer the pointer. A `highlight` bar stands out from
// quiet ones and keeps its figure up until another bar is pointed at, so what marks it is
// never its colour alone.
export function BarChart({
  bars,
  max,
  ticks,
  highlight,
}: {
  bars: Bar[];
  max: number;
  ticks: { value: number; label: string }[];
  highlight?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const percent = (value: number) => (value / max) * 100;
  const pinned = bars.findIndex((bar) => bar.key === highlight);
  const showing = active ?? (pinned >= 0 ? pinned : null);
  const shown = showing === null ? null : bars[showing];
  const middle = showing === null ? 0 : (showing + 0.5) / bars.length;

  return (
    <div
      aria-hidden
      className={cn(
        "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2",
        // Room for the figure above a bar at the top of the scale.
        highlight && "pt-9",
      )}
    >
      <div className="relative h-48">
        {ticks.map((tick) => (
          <span
            key={tick.value}
            className="absolute right-0 translate-y-1/2 text-xs text-muted-foreground tabular-nums"
            style={{ bottom: `${percent(tick.value)}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className="relative h-48" onPointerLeave={() => setActive(null)}>
        {ticks.map((tick) => (
          <div
            key={tick.value}
            className="absolute inset-x-0 border-t border-border"
            style={{ bottom: `${percent(tick.value)}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {bars.map((bar, index) => (
            <Link
              key={bar.key}
              href={bar.href}
              tabIndex={-1}
              onPointerEnter={() => setActive(index)}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  "w-full rounded-t-[4px] transition-opacity",
                  !highlight && "max-w-6 bg-chart-bar",
                  highlight && "max-w-10",
                  highlight && (bar.key === highlight ? "chart-bar-highlight" : "bg-chart-bar-quiet/30"),
                  // A pale body with a stronger cap: the top is what says how much.
                  highlight && bar.key !== highlight && bar.value > 0 && "border-t-2 border-chart-bar-quiet",
                  bar.value > 0 && "min-h-0.5",
                  active !== null && active !== index && "opacity-60",
                )}
                style={{ height: `${percent(bar.value)}%` }}
              />
            </Link>
          ))}
        </div>
        {shown && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 grid gap-0.5 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md",
              highlight
                ? "border-transparent bg-spotlight text-spotlight-foreground"
                : "bg-popover text-popover-foreground",
              middle < 0.2 ? "-translate-x-4" : middle > 0.8 ? "-translate-x-[calc(100%-1rem)]" : "-translate-x-1/2",
            )}
            style={{
              left: `${middle * 100}%`,
              bottom: `calc(${Math.min(percent(shown.value), 100)}% + 0.5rem)`,
            }}
          >
            <span className="font-semibold tabular-nums">{shown.text}</span>
            {active !== null && (
              <span className={highlight ? "text-spotlight-muted" : "text-muted-foreground"}>
                {shown.label} · {shown.detail}
              </span>
            )}
          </div>
        )}
      </div>

      <div />
      <div className="mt-1.5 flex gap-0.5">
        {bars.map((bar) => (
          <span
            key={bar.key}
            className={cn(
              "min-w-0 flex-1 text-center text-xs text-muted-foreground",
              // With every other name left out, one can run over its empty neighbours.
              highlight ? "flex justify-center whitespace-nowrap" : "truncate",
            )}
          >
            {bar.axisLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
