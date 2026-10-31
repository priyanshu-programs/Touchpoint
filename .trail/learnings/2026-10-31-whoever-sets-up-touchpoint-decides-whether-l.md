---
title: "Whoever sets up Touchpoint decides whether a model may train on email text, after a required acknowledgement"
author: L
date: 2026-10-31
branch: docs/phase-6-plan
cost: { minutes: 28, tokens: 135014 }
id: l-7766b96a
scope: repo
status: active
src: agent
touches:
  - docs/PRD.md
  - plan.md
  - security.md
  - updates.md
---

## Decided
Owner's choice, 2026-10-31, for Phase 6: nothing forces a no-training model. Settings shows what is known about the chosen model's data use, and no email text reaches a model until the person setting it up ticks an acknowledgement that the provider may keep or train on it and that this may break Google's rules on Gmail data. Recorded in security.md, PRD sections 12 and 17, and to go on the Privacy page. Same session: drafts live in Gmail and sending is allowed behind a tap, so the scopes are gmail.readonly and gmail.compose.

## Tried and ruled out
- Sending email text only to no-training models, with a plain Gmail list if none is free: recommended, but the owner wanted the choice left to whoever sets it up.
- A local model through Ollama for email: only works while that machine is on and reachable, so it doesn't suit the live site on Vercel.
- Drafts only: the owner also wanted sending, each send behind a tap.

## Watch out
Google's user data policy limits passing Gmail data to third parties and has no personal-use exception. The acknowledgement discloses this risk and doesn't remove it. Whether Gmail templates appear among drafts is still untested.
