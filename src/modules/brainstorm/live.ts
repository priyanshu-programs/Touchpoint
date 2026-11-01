import { createHmac, hkdfSync } from "node:crypto";
import { env } from "@/lib/env";

const TICKET_MS = 15 * 60_000;

// What a device needs to join a board's room. The room checks the ticket; the
// key is derived from a secret the room's host never holds, so it cannot read
// what it forwards.
export function liveRoomPass(boardId: string, secrets = env, now = Date.now()) {
  const { LIVE_ROOM_URL: url, LIVE_ROOM_SECRET: secret, APP_ENCRYPTION_KEY: root } = secrets;
  if (!url || !secret || !root) return null;
  const until = now + TICKET_MS;
  const payload = Buffer.from(JSON.stringify({ b: boardId, e: until })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return {
    url: `${url}/board/${boardId}`,
    ticket: `${payload}.${signature}`,
    until,
    key: Buffer.from(
      hkdfSync("sha256", root, "", `touchpoint:live-board:v1:${boardId}`, 32),
    ).toString("base64url"),
  };
}
