// A board's connection to its live room. Everything sent is encrypted here with
// a key the room never has; the room only passes it to the owner's other devices.

export type LiveMessage =
  // Elements as they are on the device that changed them, not yet known to be stored.
  | { t: "changes"; elements: Record<string, unknown>[] }
  // What the device that changed them has now stored, as ids and versions.
  | { t: "stored"; stored: [string, number][] }
  // Too much to name: ask the server what changed.
  | { t: "look" };

export type LiveState = "off" | "connecting" | "open";

type Pass = { url: string; ticket: string; until: number; key: string };

const PROTOCOL = "touchpoint.live";
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 30_000;
const PING_MS = 20_000;
const PONG_MS = 8_000;
// A new ticket is fetched and connected this long before the old one runs out.
const RENEW_BEFORE_MS = 60_000;

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

export function createBoardLive({
  address,
  received,
  opened,
  closed,
}: {
  // The board's own address under /api/brainstorm.
  address: string;
  received: (message: unknown) => void;
  // Told each time the room is reached, so the board can catch up on what it missed.
  opened: () => void;
  closed: () => void;
}) {
  let socket: WebSocket | null = null;
  let key: CryptoKey | null = null;
  let stopped = false;
  let retryMs = FIRST_RETRY_MS;
  let roundTrip: number | null = null;
  let pingedAt: number | null = null;
  let state: LiveState = "off";
  let renewing: ReturnType<typeof setTimeout> | undefined;
  let retrying: ReturnType<typeof setTimeout> | undefined;
  let pinging: ReturnType<typeof setInterval> | undefined;

  function retry() {
    if (stopped) return;
    clearTimeout(retrying);
    // Devices coming back at once do not all arrive together.
    const wait = retryMs * (0.5 + Math.random() / 2);
    retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
    retrying = setTimeout(() => void connect(), wait);
  }

  async function connect() {
    if (stopped) return;
    // Plain http outside this computer has no encryption here, so no room either.
    if (!crypto.subtle) return;
    if (!socket) state = "connecting";
    const response = await fetch(`${address}/live`, { method: "POST" }).catch(() => null);
    if (stopped) return;
    // No room on this instance, or no longer signed in: nothing more to try.
    if (response?.status === 204 || response?.status === 401 || response?.status === 404) {
      state = "off";
      return;
    }
    if (!response?.ok) return retry();
    const pass = (await response.json()) as Pass;
    key ??= await crypto.subtle.importKey(
      "raw",
      fromBase64Url(pass.key),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );

    const next = new WebSocket(pass.url, [PROTOCOL, pass.ticket]);
    next.binaryType = "arraybuffer";
    next.addEventListener("open", () => {
      if (stopped) return next.close();
      const before = socket;
      socket = next;
      state = "open";
      retryMs = FIRST_RETRY_MS;
      pingedAt = null;
      before?.close();
      clearTimeout(renewing);
      renewing = setTimeout(
        () => void connect(),
        Math.max(pass.until - Date.now() - RENEW_BEFORE_MS, FIRST_RETRY_MS),
      );
      opened();
    });
    next.addEventListener("message", ({ data }) => {
      if (data === "pong") {
        if (pingedAt !== null) roundTrip = Math.round(performance.now() - pingedAt);
        pingedAt = null;
      } else if (data instanceof ArrayBuffer) {
        void read(data);
      }
    });
    next.addEventListener("close", () => {
      // Replaced by a newer connection: nothing has been lost.
      if (socket && socket !== next) return;
      socket = null;
      state = stopped ? "off" : "connecting";
      closed();
      retry();
    });
  }

  async function read(data: ArrayBuffer) {
    if (!key || data.byteLength <= 12) return;
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(data, 0, 12) },
        key,
        new Uint8Array(data, 12),
      );
      received(JSON.parse(new TextDecoder().decode(plain)));
    } catch {
      // Not from a device holding this board's key.
    }
  }

  // A device that slept may hold a socket that looks open and is not.
  function ping() {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (pingedAt !== null && performance.now() - pingedAt > PONG_MS) {
      socket.close();
      return;
    }
    if (pingedAt === null) {
      pingedAt = performance.now();
      socket.send("ping");
    }
  }

  return {
    start() {
      stopped = false;
      pinging = setInterval(ping, PING_MS);
      void connect();
    },
    stop() {
      stopped = true;
      clearTimeout(renewing);
      clearTimeout(retrying);
      clearInterval(pinging);
      socket?.close();
      socket = null;
      state = "off";
    },
    isOpen: () => socket?.readyState === WebSocket.OPEN,
    status: () => ({ state, roundTrip }),
    // The message as JSON: the board has already written it out to measure it.
    async send(text: string) {
      if (!key || socket?.readyState !== WebSocket.OPEN) return false;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(text),
      );
      if (socket?.readyState !== WebSocket.OPEN) return false;
      const out = new Uint8Array(12 + sealed.byteLength);
      out.set(iv);
      out.set(new Uint8Array(sealed), 12);
      socket.send(out);
      return true;
    },
  };
}
