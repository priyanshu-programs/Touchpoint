---
title: "A note keeps its light colours on Excalidraw's dark board through a backdrop filter over the canvas, and the text editor carries its own filter"
author: L
date: 2026-10-25
branch: main
cost: { minutes: 17, tokens: 208378 }
id: l-717e70ac
scope: repo
status: active
src: agent
touches:
  - src/modules/workflows/schema.ts
  - src/modules/brainstorm/schema.ts
  - src/modules/workflows/sticky.ts
  - src/modules/workflows/sticky.test.ts
  - "src/app/(board)/workflows/[id]/sticky-notes.tsx"
  - "src/app/(board)/workflows/[id]/board.css"
  - e2e/98-sticky-look.spec.ts
  - plan.md
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - e2e/19-brainstorm.spec.ts
---

## Decided
- Sticky notes (src/app/(board)/workflows/[id]/sticky-notes.tsx, board.css) undo Excalidraw 0.18.1's dark canvas filter, invert(93%) hue-rotate(180deg), with a per-note div over the canvases: backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.163). The contrast of 1/0.86 is the exact inverse of the 93 % invert; hue-rotate commutes with invert.
- The shading layer has z-index 2 and comes after <Excalidraw> in the DOM. `.excalidraw` makes no stacking context, so this sits above the interactive canvas (2) and below the wysiwyg editor (3) and the layer UI (4). The toolbar is never inverted.

## Tried and ruled out
- saturate(1.25), as Excalidraw uses for pictures, to get back light yellow and lime: the dark filter clips those colours before the backdrop sees them, so nothing gets them back exactly. Saturating shifts reds, blues and pinks, which otherwise come back exact. Left at no saturation. Measured light yellow is 248,238,202 against 255,243,163.

## Watch out
- The text editor (.excalidraw-wysiwyg) carries the dark filter on the element itself, with its true colour (#1e1e1e) underneath. Over a bright note it reads light grey. The fix is `filter: none !important` while `.board[data-writing-on-note]`, set from onChange by writingOnNote in src/modules/workflows/sticky.ts. Applying the inverse filter to the editor did nothing.
