---
title: An edit queues a website read only when it gives a company its first address; changing an address is left to the button
author: L
date: 2026-11-06
branch: feat/enrich-on-first-domain
cost: { minutes: 12, tokens: 60996 }
id: l-f33ef0a8
scope: repo
status: active
src: agent
touches:
  - src/app/(app)/people/(lists)/organizations/company-actions.tsx
  - src/app/(app)/people/(lists)/organizations/company-panel.tsx
  - src/app/(app)/people/organizations/actions.ts
  - src/modules/organizations/service.test.ts
  - src/modules/organizations/service.ts
  - updates.md
  - src/modules/enrichment/service.test.ts
---

## Decided
2026-11-07, PR #64: updateOrganization (src/modules/organizations/service.ts) queues a website read only when the company had no domain and no website before the edit and has one after. It returns `reading: true` so updateOrganizationAction calls readWebsiteSoon(). The panel button says Enrich until latestRun finds any run (a failed one counts), then Re-enrich.

## Tried and ruled out
Reading on every address change: an edit that only tidies the address (acme.com to www.acme.com) would start a read nobody asked for. It would also leave a job queued, so the next requestEnrichment returns "busy" and a merge is refused while it runs. The existing test at src/modules/enrichment/service.test.ts that edits the website and then asks for a read relies on this not happening. Changing an existing address is left to the button.

## Watch out
updateOrganization now returns `{ ok: true, id, reading }`, so any toEqual on its result has to include `reading`.
