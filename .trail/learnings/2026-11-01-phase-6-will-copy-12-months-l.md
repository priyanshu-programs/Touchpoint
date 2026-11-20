---
title: "Phase 6 will copy 12 months of Gmail into Neon, capped at 600 MB, and borrows Hindsight's ideas without running it"
author: L
date: 2026-11-01
branch: main
cost: { minutes: 7, tokens: 138559 }
id: l-4e97ce18
scope: repo
status: active
src: agent
touches:
  - plan.md
  - docs/PRD.md
  - security.md
---

Planned, not built. plan.md, docs/PRD.md and security.md still say the mailbox isn't copied and need changing when Phase 6 planning resumes. Fuller notes: C:\Users\l\.claude\plans\i-need-you-to-validated-cookie.md.

## Decided
Owner's choices, 2026-11-01, reversing "the mailbox isn't copied":
- Copy 12 months of Gmail into the app's Neon database. Backfill and sync use no model requests; text search works with no summaries, because the free limit is 50 requests a day.
- Proposed while planning and shown to the owner: text only, rolling 12 months, pause at 600 MB with a banner, count and sample size before copying, delete the copy on disconnect as Calendar does, leave it out of the data export, never copy it to the preview database.
- Run the search on the server before the first model call, so it costs no request. Email text is never passed in automatically.
- From the knowledge-base recipe the owner brought: store the question someone would type to find each summary, search summaries and raw text separately and merge by reciprocal rank fusion (k=60, raw weighted 0.5), superseded_by, and a pointer to the original. Skip password-reset and 2FA mail; mask keys and passwords.
- From Hindsight: time-based search, beliefs combined from many facts in the nightly tidy, a separate model per job.

## Tried and ruled out
- No copy, searching Gmail live: recommended, but it can't search email and memories in one query; the owner chose the full copy.
- Copying only threads with CRM contacts: the owner chose the full copy.
- Running Hindsight: a Python server needing 1.5 GB RAM (512 MB slim, with outside embedding and reranking), so it can't run in the Vercel app; saving memories uses a model, with call counts not given in the docs read; and memories would sit outside the app's tables, so no cascade on deleting a contact.
- The recipe's SQLite, Python, cron and per-item Haiku summaries: Vercel has no permanent disk, the app is TypeScript with its own scheduler, and 1,000 items would use 20 days of requests.
- A recency bonus on facts: an old fact is still true; apply it to chats and email only.

## Watch out
Neon's free limit is 1 GB per project, measured at 36 MB on 2026-11-01. Past it, inserts, updates and deletes fail, which would stop normal CRM saves too. About 30,000 emails at 600 MB rests on an unmeasured guess of 20 KB each. Search text can't be encrypted, so database access exposes client email. A reset of the preview branch from production would carry the copy, and preview's own encryption key wouldn't protect it. Google's rules on storing restricted Gmail data for an unverified client aren't checked: do that before the Gmail step. The consent tick must also mention the stored copy.
