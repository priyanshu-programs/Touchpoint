---
title: "Money's overview converts received payments at their stored rate and counts Outstanding as of today, never by period"
author: L
date: 2026-10-27
branch: feat/revenue-dashboard
cost: { minutes: 1, tokens: 1813 }
id: l-05c3f50c
scope: repo
status: active
src: agent
touches:
  - src/lib/money.ts
  - src/modules/revenue/period.ts
  - src/modules/invoices/queries.ts
---

## Decided
- Owner's choices, 2026-10-27 (Phase 4 step 3): the sidebar entry and its Go to option are labelled "Money" and open /money (Overview), with Invoices and Payments as the next tabs (money-header.tsx TABS, app-shell.tsx NAV). The tab on a company's and a person's panel stays "Invoices". This overrides the earlier "one name everywhere" rename learning.
- Received is one base-currency figure: base payments are summed as they are (they store no rate), and others are converted with payments.fx_rate_to_base by convertToBase (src/lib/money.ts, bigint, scaled by each currency's decimals). A non-base payment with no rate is listed apart, never guessed.
- Invoiced and Outstanding stay per currency, because invoices store no rate. Outstanding ignores the period and follows only the client filter.
- Periods are calendar ones (src/modules/revenue/period.ts); a financial year from April was not asked for.

## Watch out
- Each overview figure must match the list it links to, row for row (figure-links.ts; revenue/queries.test.ts checks it). Build new figures from stateIs in src/modules/invoices/queries.ts rather than writing a second definition of issued, outstanding or overdue.
