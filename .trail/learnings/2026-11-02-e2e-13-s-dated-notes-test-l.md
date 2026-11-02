---
title: "e2e/13's dated-notes test can't run by line: it opens Board Works, made by an earlier test in the file"
author: L
date: 2026-11-02
branch: feat/note-previews
cost: { minutes: 37, tokens: 207003 }
id: l-62064d70
scope: repo
status: active
src: agent
touches:
  - e2e/13-workflows.spec.ts
  - plan.md
  - security.md
  - "src/app/(board)/workflows/[id]/box-notes.tsx"
  - updates.md
  - "src/app/(board)/workflows/[id]/highlighter.tsx"
  - e2e/01-foundation.spec.ts
  - "src/app/(board)/workflows/[id]/board-editor.tsx"
  - src/components/profile-panel.tsx
  - "src/app/(board)/brainstorm/[id]/brainstorm-editor.tsx"
---

## Watch out
- `e2e/13-workflows.spec.ts` "a box shows each kind it carries on its mark, and carries dated notes copied with the workflow" ends by opening the company "Board Works", which an earlier test in the same file creates. Run as `e2e/13-workflows.spec.ts:1046` (even with 01-foundation) it passes every note step, then times out on that click after 120 s.
- Check it with `e2e/01-foundation.spec.ts e2e/13-workflows.spec.ts` (the whole file), not by line.
- The first open of a whiteboard straight after `pnpm build` can take over 5 s on the owner's PC, so `whiteboard(page)` toBeVisible can fail once at the start; a rerun gets past it.
