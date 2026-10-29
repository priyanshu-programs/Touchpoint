---
title: Money e2e checks exact figures by working in a past month no other spec writes to
author: L
date: 2026-10-29
branch: feat/journeys-7-9
cost: { minutes: 37, tokens: 228334 }
id: l-940b3a38
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/22-journeys.spec.ts
  - package.json
  - plan.md
  - src/modules/payments/service.test.ts
  - updates.md
  - src/components/app-shell.tsx
---

## Decided
- e2e/22-journeys.spec.ts journeys 7 and 9 date their invoice and payments in May 2024 (desktop) and June 2024 (phone), and read Money and Reports with that From and To (plus the client on the overview). Other specs leave invoices and payments behind with relative dates, 2001-01, 2025-02 and 2025-03, so totals for "This month" or all time are never exact. A new money spec that needs exact totals should take another unused month (grep e2e for the date first).

## Watch out
- An invoice that is partly paid and past its due date shows "Overdue", not "Partly paid" (invoiceState). A backdated invoice reads Overdue until it is paid in full.
- At phone width the Payments list leaves out the Reference column, so a row's accessible name is "date client amount". Find a payment row by client and amount, not by reference.
- Money is not in the phone's bottom bar; it is reached through "Go to" (MOBILE_NAV in src/components/app-shell.tsx).
