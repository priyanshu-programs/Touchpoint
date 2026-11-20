---
title: "The owner's Google OAuth client for Touchpoint is in production (unverified), not Testing"
author: L
date: 2026-11-07
id: l-fcb1fed3
scope: repo
status: active
touches:
  - docs/GOOGLE-CHECKLIST.md
---

## Decided
The owner's Google OAuth client is In production and unverified (confirmed 2026-11-01). They had said so several times and were annoyed at being asked again, because the repo's notes only described Testing.

**Why:** Google's 7-day token limit for Testing doesn't apply, but Google doesn't spell out token life for unverified apps, so the 8-day check in `docs/GOOGLE-CHECKLIST.md` still stands.

## Watch out
Never ask whether the client is in Testing, or suggest publishing it. The owner chose on 2026-11-01 to finish Phase 5 before any Phase 6 work, so don't offer the assistant as next until Phase 5 is accepted.

_From Claude Code's memory of this repo, last updated Oct 31._
