---
title: "A company merge is refused while either company has a website read queued or running, and a new company with a domain always queues one"
author: L
date: 2026-10-25
branch: main
cost: { minutes: 25, tokens: 264299 }
id: l-0a9b488e
scope: repo
status: active
src: agent
touches:
  - src/modules/organizations/merge-fields.ts
  - src/modules/organizations/schema.ts
  - src/modules/organizations/service.ts
  - src/modules/organizations/merge.ts
  - src/app/(app)/people/(lists)/merge-form.tsx
  - src/app/(app)/people/(lists)/organizations/company-merge-panel.tsx
  - src/app/(app)/people/(lists)/organizations/page.tsx
  - src/modules/organizations/merge.test.ts
  - e2e/20-merge.spec.ts
  - docs/PRD.md
---

## Decided
- mergeOrganizations (src/modules/organizations/merge.ts) refuses with reason "reading" while any enrichment_runs row of either company is queued or running. A run that finished after the merge would write to a company that was deleted or whose website had changed. The merge view (company-merge-panel.tsx) disables Merge and says why, from organizationMergePreview's `reading`.
- enrichment_runs follow the Website pick: the kept website's reads stay, the other's are dropped (or moved, if the other website wins), so "Found on the website" and "Guessed from website" stay true to the website kept.

## Watch out
- insertOrganization queues a read whenever a company has a domain or website (quick add, New company, createOrganization in tests). A company created that way cannot be merged until the read finishes.
- Unit tests: src/modules/organizations/merge.test.ts marks each new company's runs done in its `company()` helper; without that every merge returns { ok: false, reason: "reading" }.
- e2e: the read runs just after the response (readWebsiteSoon in organizations/actions.ts), so e2e/20 reloads until Merge is enabled rather than clicking at once.
