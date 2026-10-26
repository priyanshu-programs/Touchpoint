---
title: Invoices are records of ones the owner designs in Figma; Touchpoint never lays out or generates an invoice
author: L
date: 2026-10-26
branch: chore/git-workflow
cost: { minutes: 1, tokens: 1425 }
id: l-0c24ca35
scope: repo
status: active
src: agent
touches:
  - plan.md
  - docs/PRD.md
  - src/lib/upload.ts
  - src/modules/settings/schema.ts
  - src/db/schema/materials.ts
---

## Decided
Owner's choice, 2026-10-27, planning Phase 4 (plan.md, docs/PRD.md section 8.8; C:\Users\l\.claude\plans\get-started-with-the-dynamic-lampson.md): the owner designs invoices in Figma. Touchpoint keeps a record of each one (src/db/schema/money.ts `invoices`: the number as on the Figma invoice, the company or person billed, `invoice_lines` with a service category, `invoice_adjustments`, dates, currency) with the exported PDF attached through the shared `upload` in src/lib/upload.ts, so payments, outstanding balances and revenue add up. Also chosen: no tax fields (type tax as a line); any currency per invoice (`CURRENCIES` in src/modules/settings/schema.ts), and a payment in another currency than the base one stores its rate to base; proposal acceptance is counted from `material_sends` of type proposal (src/db/schema/materials.ts), accepted ÷ (accepted + rejected).

## Tried and ruled out
- A printable invoice page or a generated PDF: the owner already makes the document in Figma, so any layout here would be unused (and a PDF package would need a security review).
- Tax per invoice or per line: not needed.
- Base currency only: foreign clients would have to be entered already converted.

## Watch out
Don't add invoice templates, numbering schemes or PDF output in later steps without asking. The invoice number is typed by the owner to match Figma, not generated.
