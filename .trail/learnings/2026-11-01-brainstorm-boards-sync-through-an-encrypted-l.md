---
title: "Brainstorm boards sync through an encrypted Cloudflare room per board, with polling as the fallback; Vercel WebSockets and Neon Realtime ruled out"
author: L
date: 2026-11-01
branch: feat/live-board
cost: { minutes: 24, tokens: 381441 }
id: l-7790d012
scope: repo
status: active
replaces: l-2f2da192
src: agent
touches:
  - live-room/room.ts
  - live-room/wrangler.toml
  - live-room/tsconfig.json
  - src/modules/brainstorm/live.ts
  - "src/app/api/brainstorm/[id]/live/route.ts"
  - src/lib/board-page.ts
  - src/modules/brainstorm/live.test.ts
  - "src/app/(board)/brainstorm/[id]/board-live.ts"
  - live-room/README.md
  - src/lib/live-room.ts
---

## Decided
- Owner approved 2026-11-01: brainstorm boards get a fast lane beside the existing one. live-room/room.ts is one Cloudflare Durable Object per board that forwards AES-GCM messages and stores nothing; Postgres stays the record through the elements route. src/app/(board)/brainstorm/[id]/board-live.ts is the socket; board-sync.ts relays and merges.
- Storage model is unchanged from the earlier learning: one row per element, merged by Excalidraw's version then lower nonce. Polling stays as the fallback: every 10 s without the room, once a minute with it.
- The board key is derived from APP_ENCRYPTION_KEY, never LIVE_ROOM_SECRET, because Cloudflare holds the latter and could then derive the key (src/modules/brainstorm/live.ts).
- A device that receives a change holds it (`held` in board-sync.ts) and saves it after 15 s unless the sender's `stored` message arrives, so a sender dying mid-draw loses nothing. The server already drops duplicates by version.

## Tried and ruled out
- Vercel WebSockets (GA 2026-10-20): an open socket bills provisioned memory, and Hobby has 360 GB-hours, about 180 h of a 2 GB instance, with a 30-day wait past it. Sockets also close at 300 s, and two devices can land on different instances, so Redis would be needed as well.
- Neon Realtime (beta 2026-10-15): a change must commit to Postgres before it appears, there are no performance guarantees, it needs logical replication (off on this project), and running out of the free 5 GB of transfer suspends the database.
- Returning the WebSocket Response from a Durable Object RPC method (`room.join(until)`): wrangler dev answered 500 with an empty "Uncaught". Going through `room.fetch(...)` gives 101. The cause of the RPC failure was not looked into further.

## Watch out
- A browser keeps the CSP of the document it first loaded, so a per-page `connect-src` doesn't apply after a soft navigation. A board reached from another page inside the app reloads once (brainstorm-canvas.tsx, BOARD_PAGE) or its socket would be blocked.
- Stopping `wrangler dev` can leave workerd.exe holding the port, and Playwright has reuseExistingServer false, so the next e2e run fails until it is stopped.
- Merge what the room brings through the throttled scan (`sync.justMerged()`), or each incoming change rescans the whole board on a tablet.
