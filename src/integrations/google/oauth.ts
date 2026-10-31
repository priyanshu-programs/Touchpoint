import {
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  Google,
  OAuth2RequestError,
} from "arctic";

export const CALENDAR_READ = "https://www.googleapis.com/auth/calendar.readonly";
export const CALENDAR_WRITE = "https://www.googleapis.com/auth/calendar.events";
// Who connected, read from the id token Google's own token endpoint returns.
const IDENTITY = ["openid", "email"];

export type GoogleClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GrantedTokens = {
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
};

// The refresh token was revoked, expired, or belongs to another client.
export class GrantRevokedError extends Error {
  constructor(description: string | null) {
    super(description ?? "Google no longer accepts this connection");
  }
}

export class GoogleApiError extends Error {
  constructor(readonly status: number) {
    super(`Google Calendar answered ${status}`);
  }
}

const provider = (client: GoogleClient) =>
  new Google(client.clientId, client.clientSecret, client.redirectUri);

export function consentUrl(client: GoogleClient, scopes: string[]) {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = provider(client).createAuthorizationURL(state, verifier, [
    ...IDENTITY,
    ...scopes,
  ]);
  // Offline access with the consent screen shown, so Google always sends a refresh token.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return { url, state, verifier };
}

export async function exchangeCode(
  client: GoogleClient,
  code: string,
  verifier: string,
) {
  const tokens = await provider(client).validateAuthorizationCode(code, verifier);
  const claims = decodeIdToken(tokens.idToken()) as { email?: unknown };
  return {
    accessToken: tokens.accessToken(),
    expiresAt: tokens.accessTokenExpiresAt(),
    scopes: tokens.hasScopes() ? tokens.scopes() : [],
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

export async function refreshAccess(
  client: GoogleClient,
  refreshToken: string,
): Promise<GrantedTokens> {
  try {
    const tokens = await provider(client).refreshAccessToken(refreshToken);
    return {
      accessToken: tokens.accessToken(),
      expiresAt: tokens.accessTokenExpiresAt(),
      scopes: tokens.hasScopes() ? tokens.scopes() : [],
    };
  } catch (error) {
    if (
      error instanceof OAuth2RequestError &&
      (error.code === "invalid_grant" || error.code === "unauthorized_client")
    ) {
      throw new GrantRevokedError(error.description);
    }
    throw error;
  }
}

export async function revokeGrant(client: GoogleClient, token: string) {
  await provider(client).revokeToken(token);
}

// A small read that proves the access works: the primary calendar's name.
export async function primaryCalendarName(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary",
    {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new GoogleApiError(response.status);
  const body = (await response.json()) as { summary?: unknown };
  return typeof body.summary === "string" ? body.summary : "Primary calendar";
}
