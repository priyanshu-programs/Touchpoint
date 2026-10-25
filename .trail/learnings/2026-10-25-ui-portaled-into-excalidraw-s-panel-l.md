---
title: "UI portaled into Excalidraw's panel must hand keys on: its shortcuts are a React onKeyDown, not a DOM listener"
author: L
date: 2026-10-25
branch: main
cost: { minutes: 30, tokens: 186640 }
id: l-a15c5390
scope: repo
status: active
src: agent
touches:
  - src/modules/workflows/colors.ts
  - "src/app/(board)/workflows/[id]/color-grid.tsx"
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - src/modules/workflows/colors.test.ts
  - e2e/13-workflows.spec.ts
  - e2e/19-brainstorm.spec.ts
  - e2e/50-look.spec.ts
  - plan.md
  - "src/app/(board)/workflows/[id]/board-chrome.tsx"
---

## Decided
The colour grid (src/app/(board)/workflows/[id]/color-grid.tsx) is a React portal into Excalidraw's own properties island (.App-menu__left, .App-mobile-menu on a phone), prepended as a foreign node; the island always has one React child, so Excalidraw never reorders around it.

## Watch out
Excalidraw 0.18.1 handles shortcuts with a React onKeyDown on .excalidraw-container (handleKeyboardGlobally=false). React bubbles synthetic events through the component tree, not the DOM, so a key pressed inside a portal rendered from our editor never reaches Excalidraw (Escape, tool letters). The grid re-dispatches keydown on the container, except Enter, Space and Tab. Also: when the island unmounts with our button focused, focus falls to body and the board ignores keys; the grid refocuses .excalidraw-container.

## Tried and ruled out
Restoring focus alone did not fix it (e2e/19's second box was never drawn): the keys were going up the wrong React tree, not to the wrong element.
