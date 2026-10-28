---
title: "Activity reports read on-time in the owner's zone, leave out a follow-up not yet late, and count a reply only after the first outbound"
author: L
date: 2026-10-27
branch: feat/reports-activity
cost: { minutes: 1, tokens: 3713 }
id: l-005eb196
scope: repo
status: active
src: agent
---

## Decided
- Phase 4 Step 4 part 2, src/modules/reports/activity.ts. Follow-up compliance counts follow-up tasks (origin follow_up, not cancelled) due in the period whose day has come: every one due before the owner's current date, and one due on that date only once it is done, so an open follow-up that is not late yet never lowers the rate. On time means completed_at, as a date in the owner's zone (dateIn), is on or before due_on; worked out in code, since no zone name may reach Postgres.
- Reply rate: contacts reached by an outbound activity in the period; replied when an inbound activity linked to them follows their FIRST outbound in the period, at any time since. An inbound before it is not a reply. Activities with no direction (notes) count for nothing.
- Proposal acceptance: sends of materials of type proposal with sent_at in the period, accepted / (accepted + rejected). Sent/viewed are "waiting", superseded "replaced by a newer version"; both are shown and never counted. No "expired": sends have no valid-until until the proposals table comes with Opportunities.
- Activities and sends are instants, so the period's dates become instants with fromLocalInput(`${date}T00:00`, tz), the end as to + 1 day, exclusive.

## Watch out
- e2e/26 stages these rows by SQL in March 2025, a month no other spec writes to, so it can assert exact rates. Other specs leave follow-ups, outbound activities and proposal sends in the current month, so never assert the current month's percentages.
- In that staging SQL, literals under `union all` are typed text: cast dates and timestamps (::date, ::timestamptz) or the insert fails.
