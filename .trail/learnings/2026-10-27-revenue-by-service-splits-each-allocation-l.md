---
title: "Revenue by service splits each allocation across its invoice's lines by amount; reports' notFound answers 200"
author: L
date: 2026-10-27
branch: feat/reports-revenue
cost: { minutes: 34, tokens: 343832 }
id: l-4780b7e5
scope: repo
status: active
src: agent
touches:
  - src/modules/revenue/queries.ts
  - src/modules/reports/schema.ts
  - src/modules/reports/revenue.ts
  - src/modules/reports/revenue.test.ts
  - src/lib/money.ts
  - src/app/(app)/money/reports/bar-chart.tsx
  - src/app/(app)/money/reports/links.ts
  - src/app/(app)/money/reports/page.tsx
  - src/app/(app)/money/reports/parts.tsx
  - "src/app/(app)/money/reports/[report]/page.tsx"
---

## Decided
- Owner's choices, 2026-10-27 (Phase 4 step 4): Reports is a fourth tab under Money (/money/reports), not a sidebar entry; the step ships in two parts, money reports first (part 2: follow-up compliance, reply rate, proposal acceptance by proposals SENT in the period, reply rate from outbound activities only).
- Revenue by service (src/modules/reports/revenue.ts, `shares`): an allocation pays an invoice's net total, so it is split across the invoice's lines by their gross amounts (window sum per allocation) and grouped by invoice_lines.service_category. Each service is rounded once, so the rows can differ from Received by a minor unit; the card says so only when they do. Money not yet put towards an invoice is its own row, so the rows add up to Received.
- Every report converts through `inBase` (src/modules/revenue/queries.ts), pulled out of the overview's received(), so a report never disagrees with Received about rates.
- Time to payment's "paid in full" date is greatest(latest received_on of its payments, issue_date): an advance put towards a later invoice counts as 0 days, never negative.
- Bars use --chart-bar (a deeper lime): the brand lime is 1.22:1 on the white card and fails the dataviz validator; both theme steps were validated.

## Watch out
- /money/reports/[report] calls notFound() inside a page under (app)/loading.tsx, so the response is already streaming and the status is 200, not 404. e2e/26 checks the "Not found" heading, as e2e/13 does for workflows.
- Other e2e files leave invoices and payments in the shared database, so e2e/26 checks its own client, invoice number and uniquely named services, never page totals.
