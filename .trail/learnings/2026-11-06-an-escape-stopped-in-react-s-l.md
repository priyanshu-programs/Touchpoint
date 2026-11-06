---
title: "An Escape stopped in React's onKeyDown inside the inline record search does not close the record panel; data-inline-editor was not needed there"
author: L
date: 2026-11-06
branch: fix/send-pickers-inline
cost: { minutes: 14, tokens: 185050 }
id: l-d9007efa
scope: repo
status: active
src: agent
touches:
  - e2e/16-material-sends.spec.ts
  - src/app/(app)/materials/send-form.tsx
  - src/app/(app)/people/contacts/people-at-company.tsx
  - src/components/record-picker.tsx
  - updates.md
---

## Decided
2026-11-07, PR #62: the inline search in src/components/record-picker.tsx (RecordSearchInline) closes on Escape with `event.stopPropagation()` in its React onKeyDown and has no `data-inline-editor`. Focus goes back to its button in a useLayoutEffect (useInlineSearch), for the reason the Oct 26 learning gives: a passive effect lets Base UI's panel take focus first. That was confirmed here: e2e/16 saw the button unfocused before the fix.

## Tried and ruled out
Adding `data-inline-editor` so RecordSheet (src/app/(app)/people/(lists)/record-sheet.tsx) cancels the escape-key close: a probe run of e2e/01 + e2e/16 without it passed 19/19, including the checks that the Log a send panel stays open after Escape (URL keeps send=new, Log send visible). Dropped as unneeded.

## Watch out
This contradicts the Oct 26 learning's note that stopPropagation can't stop Base UI's Escape. Here the key went to a cmdk input inside a Command; why it held was not worked out. If Escape in some other in-panel editor closes the panel, `data-inline-editor` is still the known fix.
