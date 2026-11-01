---
title: "A board reopens at its remembered view whatever that view shows, and each device keeps its own"
author: L
date: 2026-11-01
branch: feat/board-reopens-where-left
cost: { minutes: 11, tokens: 192039 }
id: l-02b93aeb
scope: repo
status: active
src: agent
touches:
  - e2e/37-board-view.spec.ts
  - security.md
  - plan.md
  - updates.md
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - e2e/19-brainstorm.spec.ts
  - e2e/13-workflows.spec.ts
---

## Decided
2026-11-01, owner's request: "exactly" where it was closed. `openingView` in `src/app/(board)/workflows/[id]/board-view.ts` restores a remembered view even when it shows none of the drawing, and on an empty board. Excalidraw's "Scroll back to content" is the way back. Each device keeps its own view in localStorage (owner's choice), because the same numbers show a different area on a different screen size. Workflows now use the same code as brainstorm boards.

## Tried and ruled out
Keeping the check that fitted the drawing when the remembered view showed none of it (PR #35): it broke "exactly". A server-stored view that follows across devices: offered and declined; it would need a migration and a new route.

## Watch out
Only a view the owner moved to may be remembered. Fitting after opening, as workflows used to, would count as a move, so the opening view must go in through initialData before the first draw. A closed tab or a tablet dropping the page unmounts nothing, so the pending view is also written on visibilitychange and pagehide, not only on React cleanup.
