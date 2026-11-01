---
title: A canvas per pen stroke is what freezes large brainstorm boards on a tablet; a one-condition Excalidraw patch draws strokes directly
author: L
date: 2026-11-01
branch: feat/board-direct-strokes
cost: { minutes: 117, tokens: 524164 }
id: l-42e5cf9e
scope: repo
status: active
src: agent
touches:
  - e2e/35-board-speed.spec.ts
  - plan.md
  - security.md
  - "src/app/(board)/brainstorm/[id]/board-view.test.ts"
  - "src/app/(board)/brainstorm/[id]/board-view.ts"
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/brainstorm/[id]/perf-readout.tsx"
  - "src/app/(board)/workflows/[id]/board-chrome.tsx"
  - "src/app/(board)/workflows/[id]/board.css"
  - updates.md
---

## Decided
2026-11-01: `patches/@excalidraw__excalidraw@0.18.1.patch` makes `renderElement`'s freedraw branch take its export path (`isExporting || type === "freedraw"`), in dist/prod and dist/dev. Excalidraw otherwise keeps one canvas per element and rebuilds every visible one when the zoom changes. A CPU profile of a 4,200-stroke board at 6x slower put 9 of 21 seconds of a zoom-out in `getContext` and garbage collection. With the patch, opening makes 3 canvases instead of 8,403, and a zoom to a new level 0 instead of 11,764. The owner's boards are nearly all pen strokes (largest 4,215). Measured only on a PC at 6x CPU slowdown until the owner reads `?perf=1` on the tablet.

## Tried and ruled out
Rebuilding a few stroke images per frame (the batching suggested in Excalidraw issue 5788): needless once strokes hold no image. Upgrading Excalidraw: issue 12437 measures `next` slower than 0.18.1. Switching to tldraw: default limit 4,000 shapes, below the largest board. Our own per-frame scans and repaint (stage 3A) showed no measurable gain alone.

## Watch out
Times on the owner's PC swing up to about 6x between runs of unchanged code (battery, and a `pnpm dev` left running), so compare canvases made, which `e2e/35-board-speed.spec.ts` counts and asserts, and read its `machine` figure. Going back to a zoom seen before reuses images and looks free, so measure a new zoom level. A view remembered while a board was empty opens it at 100% and looks fast: only a view the owner moved to is kept. Re-apply the patch by hand on any Excalidraw upgrade; its target is one minified line.
