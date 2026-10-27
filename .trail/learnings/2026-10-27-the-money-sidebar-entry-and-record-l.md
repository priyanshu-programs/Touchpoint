---
title: The Money sidebar entry and record tab are labelled Invoices; URLs still say money
author: L
date: 2026-10-27
branch: chore/rename-money-to-invoices
cost: { minutes: 13, tokens: 76775 }
id: l-0319fd64
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/23-invoices.spec.ts
  - plan.md
  - src/app/(app)/money/invoices/actions.ts
  - src/app/(app)/money/invoices/new/page.tsx
  - src/app/(app)/money/invoices/page.tsx
  - src/app/(app)/money/invoices/record-invoices.tsx
  - src/app/(app)/people/(lists)/contact-panel.tsx
  - src/app/(app)/people/(lists)/organizations/company-panel.tsx
  - src/components/app-shell.tsx
---

## Decided
- Owner's choice, 2026-10-27 (PR #11): both the sidebar entry (and its phone "Go to" option) and the tab on a company's and a person's panel read "Invoices" (src/components/app-shell.tsx NAV, company-panel.tsx and contact-panel.tsx TABS). Only labels changed: routes stay /money/invoices and ?tab=money, and src/lib/money.ts keeps its name, so links and bookmarks keep working.

## Tried and ruled out
- Renaming only the sidebar, or only the record tab: the owner wanted one name everywhere.
- Renaming the routes to /invoices: not asked for, and it would break existing links.

## Watch out
- Phase 4 steps 2-3 (payments, revenue overview) were planned to sit under "Money" (docs/PRD.md section 8.8, plan.md). With the label now "Invoices", ask the owner where payments and revenue appear (their own sidebar entry, or a renamed section) before adding them under /money.
- e2e/23-invoices.spec.ts finds the sidebar link, panel tab and Go to option by the name "Invoices" (exact).
