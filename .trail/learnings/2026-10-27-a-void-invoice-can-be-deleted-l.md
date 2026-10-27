---
title: A void invoice can be deleted; an issued one is voided first and never deleted outright
author: L
date: 2026-10-27
branch: feat/delete-void-invoice
cost: { minutes: 9, tokens: 45768 }
id: l-3ef49b50
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - e2e/23-invoices.spec.ts
  - plan.md
  - security.md
  - "src/app/(app)/money/invoices/[id]/edit/page.tsx"
  - "src/app/(app)/money/invoices/[id]/invoice-actions.tsx"
  - "src/app/(app)/money/invoices/[id]/invoice-file.tsx"
  - "src/app/(app)/money/invoices/[id]/page.tsx"
  - src/app/(app)/money/invoices/actions.ts
  - src/app/(app)/money/invoices/invoice-form.tsx
---

## Decided
- Owner's choice, 2026-10-27: deleteInvoice (src/modules/invoices/service.ts) refuses only an issued invoice; a draft or a void one is deleted, audited as invoice.delete with its snapshot. The owner's invoices are made in Figma and only recorded here, so a cancelled one has no reason to stay in the list.
- The invoice page's menu (src/app/(app)/money/invoices/[id]/invoice-actions.tsx) offers only Delete on a void invoice, confirmed with "Delete this void invoice?".
- Deleting a client's last invoice makes the company or person deletable again (the refusal counts any invoice, void or not).

## Tried and ruled out
- Keeping void invoices forever, as accounting tools do: the owner found it pointless ("wrong pages are torn out and thrown away").
- Deleting an issued invoice in one step: kept as void-then-delete so one click never removes a live invoice.

## Watch out
- security.md's invoices rule was changed to match; payments (Phase 4 step 2) must decide what deleting a void invoice does to payments allocated to it before allowing it with payments present.
