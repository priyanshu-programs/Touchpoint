# The live room

Keeps a brainstorm board in step across your devices at once. Each board gets one room, a Cloudflare Durable Object, that forwards encrypted messages between your devices and stores nothing. The database stays the record, and a board carries on without the room by asking the server for changes every 10 seconds.

It's optional. It fits Cloudflare's free plan (100,000 requests a day, with incoming messages counted at 20 to 1); past a daily limit, a board falls back to asking the server until the limit resets.

## Set it up

1. Create a free account at <https://dash.cloudflare.com> and sign in:

   ```sh
   corepack pnpm exec wrangler login
   ```

2. In `wrangler.toml`, set `ALLOWED_ORIGIN` under `[env.production.vars]` to a pattern matching your app's address, and the same under `[env.preview.vars]` if you use previews. A preview keeps its own Worker and secret, never production's.

3. Generate a secret and give it to the room. Keep the value for the next step:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   corepack pnpm exec wrangler secret put LIVE_ROOM_SECRET --config live-room/wrangler.toml --env production
   ```

4. Deploy:

   ```sh
   corepack pnpm exec wrangler deploy --config live-room/wrangler.toml --env production
   ```

5. Set these where the app runs, with `APP_ENCRYPTION_KEY` already set too:

   - `LIVE_ROOM_URL`: the address it deployed to, starting `wss://`, with no trailing slash
   - `LIVE_ROOM_SECRET`: the same value as in step 3

Open a board with `?perf=1` at the end of its address, and "Live" shows `open` and the time to the room and back.
