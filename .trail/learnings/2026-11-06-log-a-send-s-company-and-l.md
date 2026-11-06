---
title: "Log a send's company and people searches open inline under their button; every other picker keeps the centered pop-up"
author: L
date: 2026-11-06
branch: fix/send-pickers-inline
cost: { minutes: 1, tokens: 1415 }
id: l-49c613a5
scope: repo
status: active
src: agent
touches:
  - src/components/record-picker.tsx
  - e2e/01-foundation.spec.ts
---

## Decided
The owner's choice (2026-11-06): the search for the company and the people in Log a send opens right under its own button, and the pickers elsewhere stay the centered pop-up. The pickers in src/components/record-picker.tsx take an opt-in `inline` prop (a bordered panel in the normal flow; Escape closes it). PeopleAtCompany passes it through, and src/app/(app)/materials/send-form.tsx is what sets it. The search body is shared (useFound, SearchBody), so both modes behave alike.

## Tried and ruled out
Changing every picker at once: the owner answered "in the log a send tab i meant". A floating popover: src/components/ui has none, and a panel in the flow cannot cover the neighbouring field or the Note below it.

## Watch out
To give Log activity or Schedule meeting the same, pass `inline` to PeopleAtCompany in their forms; the picker needs no change. e2e/16 asserts the search sits under its button and that Escape leaves the panel open. Run e2e/01-foundation.spec.ts with it, and put a pnpm shim on PATH, because Playwright's webServer calls plain pnpm.
