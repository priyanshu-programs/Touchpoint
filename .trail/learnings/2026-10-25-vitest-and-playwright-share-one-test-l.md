---
title: "Vitest and Playwright share one test database, and each run resets it, so two runs at once break each other"
author: L
date: 2026-10-25
branch: main
cost: { minutes: 44, tokens: 105708 }
id: l-7d577946
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/20-merge.spec.ts
  - plan.md
  - security.md
  - src/app/(app)/people/(lists)/contact-panel.tsx
  - src/app/(app)/people/(lists)/contacts/page.tsx
  - src/app/(app)/people/(lists)/list-controls.tsx
  - src/app/(app)/people/(lists)/merge-form.tsx
  - src/app/(app)/people/(lists)/merge-panel.tsx
  - src/app/(app)/people/(lists)/organizations/page.tsx
---

## Decided
- Merging two people (src/modules/contacts/merge.ts) deletes the other person's row at a company they share with the kept person before it moves the star there. The partial unique index contact_organizations_primary_idx (one primary contact per company) is checked row by row, so moving the star while both rows exist fails even inside one transaction.
- The browser sends only which side wins for each field (`pick.<field>`, `custom.<key>`). The values are read from both locked rows, so a form edited in the browser cannot write a value.

## Watch out
- playwright.config.ts and Vitest both use TEST_DATABASE_URL. e2e/global-setup.ts and src/test/owner.ts resetDatabase() truncate it. A Vitest run alongside a Playwright run (from two Claude sessions in the same checkout, say) wipes the other's owner mid-run. That shows up as unrelated failures, such as organizations' "keeps another owner's organizations out of reach" returning null, or e2e signing out. Run one at a time, and tell any other session before starting.
- On the Neon test branch, a merge takes several seconds: about 30 round trips one after another. e2e/20 waits 15 seconds after a merge. 5-second waits after a form submit in 16, 18 and 19 also time out when the Neon host is slow (connect ETIMEDOUT in the server log). Re-run them; CI's local Postgres decides.
