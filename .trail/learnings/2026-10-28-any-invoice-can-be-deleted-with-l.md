---
title: Any invoice can be deleted; with payments the owner chooses to keep them unallocated or delete them
author: L
date: 2026-10-28
branch: feat/delete-any-invoice
cost: { minutes: 1, tokens: 45058 }
id: l-cc1e63c8
scope: repo
status: active
replaces: l-3ef49b50
src: agent
touches:
  - src/modules/invoices/service.ts
---

## Decided
- Owner's choice, 2026-10-28: deleteInvoice (src/modules/invoices/service.ts) deletes a draft, issued (Unpaid, Overdue, Partly paid, Paid) or void invoice. This replaces 2026-10-27's "an issued invoice is voided first, never deleted outright": the owner wants to delete any invoice when they need to.
- An invoice with payments asks in its confirmation (src/app/(app)/money/invoices/[id]/invoice-actions.tsx): "Keep the payments" (default) removes only this invoice's payment_allocations rows, so that money shows as unallocated and can be put towards another invoice, audited as payment.allocate; "Delete the payments too" removes each payment with all its allocations (removePayment), audited as payment.delete, so other invoices it paid owe that again. The action reads the choice with z.enum(["keep","delete"]).catch("keep"), so a bad value never loses money.
- Its menu still offers only Delete while it has payments: editing and voiding a paid invoice stay refused (reason "paid").
- paymentSnapshot and removePayment live in src/modules/payments/records.ts because the payments service already imports clientIsOwners from the invoices service; importing the payments service back would make a cycle.

## Watch out
- Lock order: deleteInvoice locks the invoice's payments (for update, id order) before lockInvoice, the same order allocatePayment uses (payment, then its invoices), so the two can't deadlock. Keep that order if either changes.
- payment_allocations.invoice_id keeps its no-action foreign key: allocations are removed before the invoice, and the key refuses an invoice deleted with one left.
- Deleting with "keep" still leaves the client undeletable while the payment exists (payments count in invoicesBilling).
