import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import { liveRoomPass } from "./live";

const BOARD = "11111111-1111-4111-8111-111111111111";
const secrets = {
  LIVE_ROOM_URL: "wss://room.example",
  LIVE_ROOM_SECRET: "s".repeat(32),
  APP_ENCRYPTION_KEY: "k".repeat(32),
} as Env;

describe("liveRoomPass", () => {
  it("is nothing unless the room, its secret and the root key are all set", () => {
    expect(liveRoomPass(BOARD, { ...secrets, LIVE_ROOM_URL: undefined })).toBeNull();
    expect(liveRoomPass(BOARD, { ...secrets, LIVE_ROOM_SECRET: undefined })).toBeNull();
    expect(liveRoomPass(BOARD, { ...secrets, APP_ENCRYPTION_KEY: undefined })).toBeNull();
  });

  it("signs a ticket naming the board and when it runs out", () => {
    const pass = liveRoomPass(BOARD, secrets, 1_000)!;
    const [payload, signature] = pass.ticket.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      b: BOARD,
      e: 1_000 + 15 * 60_000,
    });
    expect(signature).toBe(
      createHmac("sha256", secrets.LIVE_ROOM_SECRET!).update(payload).digest("base64url"),
    );
    expect(pass.url).toBe(`wss://room.example/board/${BOARD}`);
  });

  it("gives each board its own key, which the room's secret plays no part in", () => {
    const key = liveRoomPass(BOARD, secrets)!.key;
    expect(Buffer.from(key, "base64url")).toHaveLength(32);
    expect(key).toBe(liveRoomPass(BOARD, { ...secrets, LIVE_ROOM_SECRET: "o".repeat(32) })!.key);
    expect(key).not.toBe(liveRoomPass("22222222-2222-4222-8222-222222222222", secrets)!.key);
    expect(key).not.toBe(liveRoomPass(BOARD, { ...secrets, APP_ENCRYPTION_KEY: "j".repeat(32) })!.key);
  });
});
