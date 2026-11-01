// One room per brainstorm board, passing messages between the owner's devices.
// A message is encrypted in the browser with a key this service is never given:
// it is forwarded unread and nothing is stored.
import { DurableObject } from "cloudflare:workers";

type Env = {
  ROOMS: DurableObjectNamespace<BoardRoom>;
  LIVE_ROOM_SECRET: string;
  // A pattern set in wrangler.toml, never from a request.
  ALLOWED_ORIGIN: string;
};

type Attachment = { until: number; second: number; count: number };

const PROTOCOL = "touchpoint.live";
const UNTIL_HEADER = "x-ticket-until";
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_SOCKETS = 8;
const MAX_MESSAGES_A_SECOND = 100;
const TICKET_EXPIRED = 4001;
const BOARD_PATH = /^\/board\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const refused = (status: number) => new Response(null, { status });

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

// When the ticket for this board stops being good, or null if it is not good now.
async function ticketUntil(ticket: string, board: string, secret: string) {
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const good = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!good) return null;
    const { b, e } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      b: unknown;
      e: unknown;
    };
    return b === board && typeof e === "number" && e > Date.now() ? e : null;
  } catch {
    return null;
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return new Response("ok");
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return refused(426);

    const board = BOARD_PATH.exec(pathname)?.[1];
    if (!board) return refused(404);
    const origin = request.headers.get("origin") ?? "";
    if (!new RegExp(env.ALLOWED_ORIGIN).test(origin)) return refused(403);

    // A browser can set no header on a WebSocket but this one, and it stays out of logs of addresses.
    const offered = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim());
    const ticket = offered.find((protocol) => protocol !== PROTOCOL);
    if (!offered.includes(PROTOCOL) || !ticket) return refused(401);
    const until = await ticketUntil(ticket, board, env.LIVE_ROOM_SECRET);
    if (!until) return refused(401);

    const room = env.ROOMS.get(env.ROOMS.idFromName(board), { locationHint: "apac" });
    return room.fetch(request.url, { headers: { Upgrade: "websocket", [UNTIL_HEADER]: String(until) } });
  },
};
export default worker;

export class BoardRoom extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    // Answered without waking the room, so a device can tell it is still connected at no cost.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // Reached only through the worker above, which has checked the ticket.
  override fetch(request: Request): Response {
    const until = Number(request.headers.get(UNTIL_HEADER));
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return refused(429);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ until, second: 0, count: 0 } satisfies Attachment);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": PROTOCOL },
    });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const now = Date.now();
    const sender = socket.deserializeAttachment() as Attachment;
    if (sender.until <= now) return socket.close(TICKET_EXPIRED, "ticket expired");
    if (typeof message === "string" || message.byteLength > MAX_MESSAGE_BYTES) {
      return socket.close(1009, "refused");
    }

    const second = Math.floor(now / 1000);
    const count = sender.second === second ? sender.count + 1 : 1;
    socket.serializeAttachment({ until: sender.until, second, count } satisfies Attachment);
    if (count > MAX_MESSAGES_A_SECOND) return;

    for (const other of this.ctx.getWebSockets()) {
      if (other === socket) continue;
      // A socket whose ticket has run out hears nothing more, so signing out takes effect.
      if ((other.deserializeAttachment() as Attachment).until <= now) {
        other.close(TICKET_EXPIRED, "ticket expired");
        continue;
      }
      try {
        other.send(message);
      } catch {
        // That device has just gone; it catches up from the database when it is back.
      }
    }
  }

  webSocketClose(socket: WebSocket, code: number) {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "closing");
    } catch {
      // Already closed.
    }
  }
}
