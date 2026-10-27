---
title: "A company or person with invoices cannot be deleted; the invoice's client keys are no action, not restrict"
author: L
date: 2026-10-26
branch: feat/invoices
cost: { minutes: 38, tokens: 445659 }
id: l-0874df9a
scope: repo
status: active
src: agent
touches:
  - src/db/schema/money.ts
  - src/lib/money.ts
  - src/lib/money.test.ts
  - src/modules/invoices/schema.ts
  - src/modules/invoices/service.ts
  - src/modules/invoices/queries.ts
  - src/app/(app)/people/(lists)/record-actions.tsx
  - src/app/(app)/money/invoices/labels.ts
  - src/app/(app)/money/invoices/status-pill.tsx
  - src/app/(app)/money/invoices/record-invoices.tsx
---

## Decided
Owner's choice, 2026-10-27 (Phase 4 step 1, invoices): deleting a company or person that an invoice bills is refused, so money records never vanish with a client. deleteOrganization (src/modules/organizations/service.ts) and deleteContact (src/modules/contacts/service.ts) return a result ({ ok: false, reason: "invoiced", count }) instead of a boolean; the panel shows why in place of the confirmation (`remove.blocked` in src/app/(app)/people/(lists)/record-actions.tsx, text from `invoicedBlock` in src/app/(app)/money/invoices/labels.ts), and the bulk delete returns how many it kept. Merges (src/modules/organizations/merge.ts, src/modules/contacts/merge.ts) move invoices to the kept record.

## Tried and ruled out
- Deleting the invoices with the client: revenue history could go with one click.
- Keeping them with the client blanked: they would count towards revenue with nobody to say who for.
- `onDelete: "restrict"` on invoices.organization_id / contact_id (src/db/schema/money.ts): restrict is checked at once, so deleting the owner's user row, which cascades to companies and invoices together, could fail partway. "no action" is checked at the end of the statement.

## Watch out
Payments (Phase 4 step 2) and anything else that points at a client should follow the same rule and be moved by both merges.
