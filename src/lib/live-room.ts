import { env } from "./env";

// Where the live room is, if this instance has one. It needs all three: the root
// key is what keeps the room from reading what it forwards.
export const liveRoomOrigin = () =>
  env.LIVE_ROOM_URL && env.LIVE_ROOM_SECRET && env.APP_ENCRYPTION_KEY
    ? new URL(env.LIVE_ROOM_URL).origin
    : undefined;
