---
title: "Brainstorm boards store one row per element and merge devices by Excalidraw's version rule; polling, not WebSockets"
author: L
date: 2026-10-28
branch: feat/brainstorm-stroke-sync
cost: { minutes: 37, tokens: 259413 }
id: l-2f2da192
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/23-invoices.spec.ts
  - e2e/24-payments.spec.ts
  - plan.md
  - security.md
  - "src/app/(app)/money/invoices/[id]/invoice-actions.tsx"
  - "src/app/(app)/money/invoices/[id]/page.tsx"
  - src/app/(app)/money/invoices/actions.ts
  - src/db/schema/money.ts
  - src/modules/invoices/service.test.ts
---

## Decided
- Owner's choice 2026-10-28, after a handwritten board hit the 3 MB whole-scene limit: brainstorm boards only (workflow boards keep the single `scene` jsonb, since stages, attachments, box notes and pictures read it), several devices kept in step.
- Modelled on Excalidraw collab (per-element version/versionNonce, send only elements whose version moved, the lower nonce wins a tie, tombstones), tldraw sync (a record per shape) and Figma's journal (a per-board clock; a device asks for changes since its clock).
- src/db/schema/brainstorm.ts `brainstorm_elements`; src/modules/brainstorm/service.ts saveBrainstormElements / brainstormChanges / pruneBrainstorm; src/app/api/brainstorm/[id]/elements/route.ts (GET pages of ~2 MB, PATCH); src/app/(board)/brainstorm/[id]/board-sync.ts on the client.
- Polling every 10 s while visible, plus `behind` on each save. Vercel functions cannot hold WebSockets open.

## Tried and ruled out
- Raising the 3 MB limit or compressing the whole scene: both keep "send everything every save" and the 4.5 MB Vercel body ceiling.

## Watch out
- Merge remote elements with `restoreElements(remote, null)`. Passing local elements makes restore bump versions, so the remote copy would always win.
- board-sync's `changed()` compares a hash over *sendable* elements only. Otherwise a full board resends on every scroll, and a picture that has just finished storing (no version change) is never sent.
- Deletions are kept as tombstones (`deleted`, full data) for 30 days; pruneBrainstorm sets `pruned`, and a device with `since < pruned` gets `{reset:true}` and reloads whole.
- Migration 0034 moved `scene` into rows at clock 1 and emptied it; the `scene` and `version` columns are still there, to drop in a later migration.
- e2e: count sticky notes in another window with `.sticky-shadow` (DOM), since the canvas can't be read. Use two browser contexts so both windows count as visible.
