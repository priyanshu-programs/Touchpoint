---
title: "Scheduling a meeting takes two presses, and the form's key is Google's event id so a resend can't invite twice"
author: L
date: 2026-10-31
branch: feat/schedule-meeting
cost: { minutes: 26, tokens: 322160 }
id: l-fe48f419
scope: repo
status: active
src: agent
touches:
  - src/integrations/google/oauth.ts
  - src/integrations/google/calendar.ts
  - src/app/api/integrations/google/connect/route.ts
  - src/app/api/integrations/google/cookie.ts
  - src/app/api/integrations/google/callback/route.ts
  - src/modules/integrations/scheduling.ts
  - src/app/(app)/meetings/actions.ts
  - src/app/(app)/form-state.ts
  - src/app/(app)/meetings/schedule-form.tsx
  - src/app/(app)/meetings/new-meeting.tsx
---

## Decided
- 2026-10-31, owner's choice (Phase 5 step 5): the schedule form has "Email the invitation to guests" and "Add a Google Meet link" boxes, both on by default, with a location field.
- src/modules/integrations/scheduling.ts: the first press only checks and returns a sentence built on the server; only confirmed=yes reaches Google, and every check runs again.
- src/integrations/google/calendar.ts: the form's uuid, without hyphens, is the event id. Google answers 409 to a resend, and the existing event is read instead of a second being made, so retrying after a timeout is safe.
- Declining calendar.events at Google keeps the read connection and revokes nothing, because revoking ends the whole grant.

## Tried and ruled out
- Always emailing or never emailing guests: the owner wanted the choice per meeting, stated in the confirmation.
- No Meet links, or a box off by default: the owner wanted Join meeting to work straight away.
- Meetings 90 days ahead or later: refused, because the sync drops anything past its window, so the copy would vanish from Touchpoint.

## Watch out
- e2e can't reach a created meeting: Google's address is fixed, so that path waits for Step 6's fake Google server and the owner's hand test on production.
- The owner must add calendar.events under Data Access on their Google client before pressing Allow scheduling.
- A scheduled meeting isn't on the Activity tab until it has started (the timeline rule from Step 3), so the form lands on the meeting's panel instead.
