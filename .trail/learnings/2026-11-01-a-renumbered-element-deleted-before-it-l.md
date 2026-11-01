---
title: "A renumbered element deleted before it is sent on must still count as known, or the delete goes nowhere; a slow PC hides this and CI doesn't"
author: L
date: 2026-11-01
branch: feat/live-board
cost: { minutes: 27, tokens: 119242 }
id: l-8b76367d
scope: repo
status: active
replaces: l-97d88549
src: agent
touches:
  - e2e/19-brainstorm.spec.ts
  - "src/app/(board)/brainstorm/[id]/board-sync.ts"
  - e2e/36-live-board.spec.ts
  - e2e/39-board-pan.spec.ts
  - plan.md
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - "src/app/(board)/workflows/[id]/right-drag-pan.ts"
  - updates.md
---

## Decided
- src/app/(board)/brainstorm/[id]/board-sync.ts merge() reads each remote element's version and nonce before reconcileElements, so a renumbered element counts as this device's own change and is sent on. Everything that arrived goes into `relayed`, and from the room into `sent` at 0 if absent, because otherwise a delete of it is filtered as "deleted before it was ever known" and goes nowhere.

## Tried and ruled out
- Reading versions first, alone: the two-window test in e2e/19 still failed on CI, because that left renumbered elements out of `relayed` and `sent`.
- Judging the deleted-in-the-window cause by a test using keyboard.press: it passed on the unfixed code locally, because a slow PC misses the window of about 300 ms (the throttled scan, then the relay timer). The fast CI machine hit it.

## Watch out
- reconcileElements calls syncInvalidIndices, which calls mutateElement, so a clash in fractional `index` raises the version and draws a new nonce in place on the remote object being merged.
- A test that races must act inside the page: e2e/36 uses a MutationObserver and dispatches the keys, and it then fails on the unfixed code every time it was run.
- Not shown directly: that this window caused the e2e/19 two-window failure. Logging never caught that test failing, only the same symptom and timing.
- CI doesn't run on a conflicting PR, and gh pr checks then shows nothing failing. plan.md conflicts whenever another PR adds a paragraph, so check the PR is mergeable after each push.
