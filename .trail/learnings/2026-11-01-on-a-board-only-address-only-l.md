---
title: "On a board only address-only text becomes a link, because a canvas text has one colour and one link; meeting locations stay plain"
author: L
date: 2026-11-01
branch: feat/auto-links
cost: { minutes: 13, tokens: 234153 }
id: l-52fbd50c
scope: repo
status: active
src: agent
touches:
  - src/lib/autolink.ts
  - src/lib/autolink.test.ts
  - src/lib/url.ts
  - src/components/linked-text.tsx
  - src/modules/workflows/typed-link.ts
  - src/modules/workflows/typed-link.test.ts
  - "src/app/(board)/workflows/[id]/typed-links.ts"
  - "src/app/(board)/workflows/[id]/box-notes.tsx"
  - e2e/38-auto-links.spec.ts
  - plan.md
---

## Decided
Owner's choices, 2026-11-01. Addresses become links by themselves on whiteboards and in typed notes. On a board, only text that is nothing but an address becomes a link, set when writing finishes or after a paste (src/app/(board)/workflows/[id]/typed-links.ts), never per frame. Inside a box or sticky note the link goes on the box and the blue on the text. It opens from Excalidraw's corner icon or the popup on the selected text. typedLinkChange (src/modules/workflows/typed-link.ts) does nothing if the text did not change, so a link the owner removed stays removed.

## Tried and ruled out
Linking or colouring a whole block because it contains an address among other words: the owner chose to leave sentences plain. One click on the words opening the link: needs another Excalidraw patch and makes selecting and dragging that text harder.

## Watch out
On the activity timeline a calendar row's body is the meeting's location from Google (migration 0037), so LinkedText is skipped for eventType calendar_event. A company description can come from its website and also stays plain. Phase 6 emails saved as activities must be excluded from LinkedText the same way.
