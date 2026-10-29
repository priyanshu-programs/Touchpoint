---
title: "e2e/22-journeys can't be run with 01 alone: journey 2 needs Acme Design from the earlier specs, so a journeys fix is checked by the full suite"
author: L
date: 2026-10-29
branch: feat/connect-google
cost: { minutes: 4, tokens: 22483 }
id: l-5ec3749b
scope: repo
status: active
src: agent
touches:
  - e2e/22-journeys.spec.ts
  - updates.md
  - e2e/01-foundation.spec.ts
---

## Decided
2026-10-29: journey 7 on a phone failed CI on main from #21 onwards. checkFits saw the Money client picker's CommandDialog still closing (role dialog) and then polled `[data-slot="sheet-content"]`, which never appeared, so expect.poll timed out after 5 s. checkFits now counts sheet-content itself, so only the record's side panel is measured.

## Tried and ruled out
- Running `e2e/01-foundation.spec.ts e2e/22-journeys.spec.ts` alone to check it: journey 2 fails at once ("That domain already belongs to Acme Design." not found), since Acme Design is made by an earlier spec. Use the full `pnpm test:e2e` or CI.

## Watch out
- A red `check` on a merged PR is not caught by anything yet: #21 merged with this test failing. Look at `gh run list --branch main` before blaming a new PR for a journeys failure.
- In e2e, `getByRole("dialog")` matches pickers and confirmations too, not just the record panel.
