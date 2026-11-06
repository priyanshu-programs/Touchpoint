---
title: "A record's Invoices tab opens invoices and payments inside the panel, and only ones that bill that record"
author: L
date: 2026-11-06
branch: feat/invoices-in-panel
cost: { minutes: 5, tokens: 17345 }
id: l-37b33b6f
scope: repo
status: active
src: agent
touches:
  - e2e/22-journeys.spec.ts
  - e2e/23-invoices.spec.ts
  - e2e/42-invoices-in-panel.spec.ts
  - plan.md
  - "src/app/(app)/money/invoices/[id]/edit/page.tsx"
  - "src/app/(app)/money/invoices/[id]/invoice-actions.tsx"
  - "src/app/(app)/money/invoices/[id]/invoice-details.tsx"
  - "src/app/(app)/money/invoices/[id]/page.tsx"
  - src/app/(app)/money/invoices/actions.ts
  - src/app/(app)/money/invoices/invoice-editors.tsx
---

## Decided
- Owner's choices, 2026-11-07 (PR #65): every link in a company's or person's Invoices tab (an invoice, a payment, New invoice, Record payment) opens in the record panel as an entry, like tasks and activities, and so does everything done to them (edit, issue, void, delete, record a payment towards an invoice, delete a payment). Both panels, company and person. The /money pages stay as they were.
- Entries live in src/app/(app)/people/(lists)/entry-panel.tsx (findEntry, MoneyEntry); the pages under /money share InvoiceDetails, PaymentDetails, NewInvoice, EditInvoice and NewPayment with the panel.
## Tried and ruled out
- Opening only the view, or only the new forms, in the panel: the owner wanted all four links.
## Watch out
- findEntry opens an invoice or payment only when it bills the panel's record (billsTo). Opened under a company with `contact=` for someone not at that company, the organizations page drops it (`shown`).
- After a save or delete, the money actions go back to the panel through readOrigin + moneyPanelHref (src/app/(app)/people/labels.ts), from the client ids they checked, never a URL from the form. A form with no `from` falls back to the /money pages. A new invoice with a file goes back through InvoiceForm's `savedHref`, because the browser navigates after the upload.
- e2e/22 journey 7 and e2e/23 now make the invoice in the panel, then go to /money/invoices/<id> for the rest.
