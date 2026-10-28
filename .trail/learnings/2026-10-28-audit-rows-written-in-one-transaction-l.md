---
title: "Audit rows written in one transaction share a timestamp, so tests must not assume their order"
author: L
date: 2026-10-28
branch: feat/delete-any-invoice
cost: { minutes: 6, tokens: 19713 }
id: l-73e2d1e4
scope: repo
status: active
src: agent
touches:
  - src/modules/payments/service.test.ts
  - updates.md
  - docs/PRD.md
  - e2e/23-invoices.spec.ts
  - e2e/24-payments.spec.ts
  - plan.md
  - security.md
  - "src/app/(app)/money/invoices/[id]/invoice-actions.tsx"
  - "src/app/(app)/money/invoices/[id]/page.tsx"
  - src/app/(app)/money/invoices/actions.ts
---

## Watch out
- audit_log's time comes from now(), which Postgres fixes at the start of a transaction. Several audit() calls in one transaction (deleteInvoice writes payment.allocate or payment.delete for each payment, then invoice.delete) get the same time, and listAudit returns them in either order.
- The new tests in src/modules/payments/service.test.ts passed locally and failed in CI with the order reversed. They now sort the actions before comparing. Any test that reads two or more entries from one transaction should do the same, or filter by action as the older payment tests do.
