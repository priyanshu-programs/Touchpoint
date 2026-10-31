// A stand-in for Google's token and Calendar endpoints, for Playwright only. It listens on
// loopback and holds its state in memory. e2e/fake-google/reroute.mjs sends the app here.
import { createServer } from "node:http";

const PORT = 3101;
const READ = "https://www.googleapis.com/auth/calendar.readonly";
const WRITE = "https://www.googleapis.com/auth/calendar.events";
const EVENTS_PATH = "/calendar/v3/calendars/primary/events";
const ID_SHAPE = /^[a-v0-9]{5,1024}$/;

const fresh = () => ({
  account: "owner@gmail.test",
  scopes: [READ, WRITE],
  expiresIn: 3600,
  revoked: false,
  issued: 0,
  liveTokens: new Set(),
  clock: 0,
  events: new Map(),
  pageSize: 250,
  // "expire-sync" answers the next sync-token read with 410; "error" and "lost" answer the
  // next insert with 500, and "lost" has stored the event first, as when an answer goes missing.
  nextFailure: null,
  requests: [],
});
let state = fresh();

function idToken(email) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({ sub: "fake", email })}.fake-signature`;
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body === undefined ? "" : JSON.stringify(body));
}

function grantTokens(extra = {}) {
  state.issued += 1;
  const accessToken = `fake-access-${state.issued}`;
  state.liveTokens.add(accessToken);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: state.expiresIn,
    scope: ["openid", "https://www.googleapis.com/auth/userinfo.email", ...state.scopes].join(" "),
    ...extra,
  };
}

function handleToken(body, response) {
  const form = new URLSearchParams(body);
  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    // A new consent is a new grant, whatever happened to the last one.
    state.revoked = false;
    return send(
      response,
      200,
      grantTokens({ refresh_token: "fake-refresh", id_token: idToken(state.account) }),
    );
  }
  if (grant === "refresh_token" && !state.revoked) return send(response, 200, grantTokens());
  return send(response, 400, {
    error: "invalid_grant",
    error_description: "Token has been expired or revoked.",
  });
}

function store(event) {
  state.clock += 1;
  state.events.set(event.id, { event, changedAt: state.clock });
}

const startOf = ({ start }) =>
  start?.dateTime ? new Date(start.dateTime) : new Date(`${start?.date}T00:00:00Z`);

function listEvents(url, response) {
  const syncToken = url.searchParams.get("syncToken");
  if (syncToken && state.nextFailure === "expire-sync") {
    state.nextFailure = null;
    return send(response, 410, { error: { code: 410, message: "Sync token is no longer valid" } });
  }
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  const since = syncToken ? Number(syncToken.replace("fake-sync-", "")) : 0;
  const matching = [...state.events.values()]
    .filter(({ event, changedAt }) =>
      syncToken
        ? changedAt > since
        : event.status !== "cancelled" &&
          (!timeMin || startOf(event) >= new Date(timeMin)) &&
          (!timeMax || startOf(event) < new Date(timeMax)),
    )
    .map(({ event }) => event);

  const offset = Number(url.searchParams.get("pageToken") ?? 0);
  const end = offset + state.pageSize;
  const more = end < matching.length;
  return send(response, 200, {
    kind: "calendar#events",
    summary: state.account,
    timeZone: "Asia/Kolkata",
    items: matching.slice(offset, end),
    ...(more ? { nextPageToken: String(end) } : { nextSyncToken: `fake-sync-${state.clock}` }),
  });
}

function insertEvent(url, body, response) {
  const input = JSON.parse(body);
  if (!ID_SHAPE.test(input.id ?? "")) {
    return send(response, 400, { error: { code: 400, message: "Invalid resource id value." } });
  }
  if (state.events.has(input.id)) {
    return send(response, 409, { error: { code: 409, message: "The requested identifier already exists." } });
  }
  if (state.nextFailure === "error") {
    state.nextFailure = null;
    return send(response, 500, { error: { code: 500, message: "Backend Error" } });
  }

  const wantsMeet =
    url.searchParams.get("conferenceDataVersion") === "1" && input.conferenceData?.createRequest;
  const meetLink = `https://meet.google.com/fak-${input.id.slice(0, 4)}-${input.id.slice(4, 7)}`;
  const event = {
    kind: "calendar#event",
    status: "confirmed",
    eventType: "default",
    htmlLink: `https://www.google.com/calendar/event?eid=${input.id}`,
    organizer: { email: state.account, self: true },
    ...input,
    attendees: input.attendees?.map((attendee) => ({ responseStatus: "needsAction", ...attendee })),
    ...(wantsMeet
      ? {
          hangoutLink: meetLink,
          conferenceData: { entryPoints: [{ entryPointType: "video", uri: meetLink }] },
        }
      : { conferenceData: undefined }),
  };
  store(event);
  if (state.nextFailure === "lost") {
    state.nextFailure = null;
    return send(response, 500, { error: { code: 500, message: "Backend Error" } });
  }
  return send(response, 200, event);
}

function handleCalendar(request, url, body, response) {
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (state.revoked || !state.liveTokens.has(token)) {
    return send(response, 401, { error: { code: 401, message: "Invalid Credentials" } });
  }
  if (url.pathname === "/calendar/v3/calendars/primary") {
    return send(response, 200, { kind: "calendar#calendar", id: state.account, summary: state.account });
  }
  if (url.pathname === EVENTS_PATH) {
    return request.method === "POST"
      ? insertEvent(url, body, response)
      : listEvents(url, response);
  }
  const held = state.events.get(url.pathname.slice(EVENTS_PATH.length + 1));
  return held
    ? send(response, 200, held.event)
    : send(response, 404, { error: { code: 404, message: "Not Found" } });
}

// What a test uses to set the scene and to read what the app sent.
function handleControl(url, body, response) {
  const input = body ? JSON.parse(body) : {};
  switch (url.pathname) {
    case "/__fake/health":
      return send(response, 200, { ok: true });
    case "/__fake/reset":
      state = fresh();
      return send(response, 200, {});
    case "/__fake/configure":
      for (const key of ["scopes", "expiresIn", "pageSize", "nextFailure"]) {
        if (key in input) state[key] = input[key];
      }
      return send(response, 200, {});
    case "/__fake/events":
      for (const event of input.events) {
        store({ kind: "calendar#event", status: "confirmed", eventType: "default", ...event });
      }
      return send(response, 200, {});
    case "/__fake/revoke":
      state.revoked = true;
      return send(response, 200, {});
    case "/__fake/state":
      return send(response, 200, {
        revoked: state.revoked,
        requests: state.requests,
        events: [...state.events.values()].map(({ event }) => event),
      });
    default:
      return send(response, 404, {});
  }
}

createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith("/__fake/")) return handleControl(url, body, response);

    state.requests.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: url.pathname === EVENTS_PATH && body ? JSON.parse(body) : null,
    });
    if (url.pathname === "/token") return handleToken(body, response);
    if (url.pathname === "/revoke") {
      state.revoked = true;
      return send(response, 200);
    }
    return handleCalendar(request, url, body, response);
  });
}).listen(PORT, "127.0.0.1");
