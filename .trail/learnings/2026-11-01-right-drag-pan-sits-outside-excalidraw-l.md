---
title: "Right-drag pan sits outside Excalidraw because its pan accepts only middle, space or hand, and the menu event's timing differs by OS"
author: L
date: 2026-11-01
branch: feat/right-drag-pan
cost: { minutes: 14, tokens: 178701 }
id: l-25a84fe8
scope: repo
status: active
src: agent
touches:
  - "src/app/(board)/workflows/[id]/right-drag-pan.ts"
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - e2e/37-board-pan.spec.ts
  - plan.md
  - security.md
  - e2e/19-brainstorm.spec.ts
  - e2e/35-board-speed.spec.ts
  - e2e/13-workflows.spec.ts
---

## Decided
- 2026-11-01: src/app/(board)/workflows/[id]/right-drag-pan.ts adds window capture listeners and moves the view with api.updateScene, used by both board editors. Excalidraw 0.18.1's handleCanvasPanUsingWheelOrSpaceDrag has no setting for the right button, and a right press there only captures the pointer, closes a menu and returns before any selecting, so the press can pass through untouched.
- Mouse only, canvas only, 4 px before a press counts as a drag. A pen's barrel button is left out so writing on the tablet can't change.

## Tried and ruled out
- Adding a condition to patches/@excalidraw__excalidraw@0.18.1.patch: not needed, and the patch must be redone by hand on any version change.

## Watch out
- contextmenu fires after release on Windows and on press on Mac and Linux. So the hook swallows it during a hold and replays it on a release with no drag, and swallows the one that follows a pan. The listener is on window so a release over the header doesn't bring up the browser's own menu.
- The hook stops propagation of pointermove while panning so Excalidraw skips its hover hit-test; pointerup must still reach Excalidraw or its gesture state goes wrong.
- A parallel worktree's Playwright run holds ports 3100 and 3101 (reuseExistingServer is false), so a second run fails at once. Check the process's command line before stopping anything: it may be another window's run.
