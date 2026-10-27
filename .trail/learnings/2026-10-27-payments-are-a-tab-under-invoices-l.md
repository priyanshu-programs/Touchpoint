---
title: "Payments are a tab under Invoices; an invoice with payments is never edited or voided, so a void invoice has none"
author: L
date: 2026-10-27
branch: feat/payments
cost: { minutes: 29, tokens: 386803 }
id: l-d3e1499f
scope: repo
status: active
src: agent
touches:
  - src/modules/invoices/state.ts
  - src/modules/invoices/queries.ts
  - src/app/(app)/money/invoices/status-pill.tsx
  - src/modules/invoices/service.ts
  - src/modules/payments/schema.ts
  - src/modules/payments/service.ts
  - src/modules/payments/queries.ts
  - src/app/(app)/money/money-header.tsx
  - src/app/(app)/money/invoices/page.tsx
  - src/app/(app)/money/invoices/record-invoices.tsx
---

## Decided
- Owner's choices, 2026-10-27 (Phase 4 step 2): payments live at /money/payments as the second of two tabs (Invoices | Payments, src/app/(app)/money/money-header.tsx) under the one "Invoices" sidebar entry, not a sidebar item of their own. Refunds are left out (a mistaken payment is deleted). A payment may be larger than the invoices it covers; the rest stays unallocated and is put towards a later invoice from the payment's page (allocatePayment). The payer is the client (organization_id or contact_id), so the same rules as invoices apply: a client with payments is not deleted (invoicesBilling counts both) and both merges move payments.
- updateInvoice and voidInvoice refuse an invoice with allocations (reason "paid"), checked with the invoice row locked; allocationRefusal in src/modules/payments/service.ts locks the invoices before reading balances. So a void invoice never has payments, which settles what deleting a void invoice does to them: nothing.
- Paid, partly paid and overdue are worked out (src/modules/invoices/state.ts, stateIs in queries.ts), with the owner's date passed in, never a zone name to Postgres.

## Tried and ruled out
- A free-text "Paid by" beside the client: the owner chose the client alone.

## Watch out
- e2e/23 now expects "Unpaid" for an issued invoice, not "Issued". On the invoice page "Paid" appears both as the pill and as a footer row label, so tests look for the pill inside the page's header.
- Step 3 (revenue overview) converts received money with payments.fx_rate_to_base, which is null for the base currency.
