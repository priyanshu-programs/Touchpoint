---
title: "Gmail reading and sending belong to the Phase 6 assistant, not Phase 5, by the owner's choice"
author: L
date: 2026-10-29
branch: feat/connect-google
cost: { minutes: 1, tokens: 1779 }
id: l-09c77ad4
scope: repo
status: active
src: agent
touches:
  - plan.md
  - docs/PRD.md
  - src/modules/reports/activity.ts
---

## Decided
Owner's choice, 2026-10-29 (plan.md "Phase 5 — Connect Google and Calendar", docs/PRD.md sections 3 and 16): Touchpoint does not sync Gmail or send email in Phase 5. The Phase 6 assistant reads Gmail on request, and only the emails the owner picks ("save this under Maple Studio") become activities, so the mailbox never floods the records. Phase 5 covers connecting Google (the client typed in Settings, sealed with APP_ENCRYPTION_KEY) and Calendar: sync, meetings on Today and the Activity tab, a Calendar view under Tasks, scheduling a meeting.

## Tried and ruled out
- Mirroring threads with known contacts into email_* tables (PRD 11.1 as first written): the owner didn't want email overflow in the CRM.
- Sending email, and materials by email, from a person's panel: dropped by the owner and left for the assistant.
- Client ID and secret in env vars: the owner chose the Settings form, stored encrypted (integration_clients).

## Watch out
- Don't add gmail.readonly or gmail.send scopes, email_* tables or a Gmail sync job before Phase 6. Connect asks only for `openid email calendar.readonly`; calendar.events is asked by incremental consent when scheduling is built. The restricted-scope 8-day token check moves to Phase 6 with gmail.readonly.
- Reply rate (src/modules/reports/activity.ts) and material sends count only activities the owner logs.
- Google redirects only to addresses registered on the owner's client, and a preview has its own APP_ENCRYPTION_KEY, so Connect is tested locally and on production, not on a PR preview.
