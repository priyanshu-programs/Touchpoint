import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { integrationClients, integrationConnections, jobs } from "@/db/schema";
import {
  CALENDAR_READ,
  GoogleApiError,
  GrantRevokedError,
} from "@/integrations/google/oauth";
import { encryptSecret } from "@/lib/crypto";
import { listAudit } from "@/modules/audit/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { googleClientInput } from "./schema";
import {
  completeGoogleConnect,
  disconnectGoogle,
  enqueueGoogleChecks,
  googleAccessToken,
  googleClientStatus,
  googleConnection,
  googleNeedsReconnect,
  removeGoogleClient,
  saveGoogleClient,
  startGoogleConnect,
  testGoogleConnection,
} from "./service";

const google = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  refreshAccess: vi.fn(),
  revokeGrant: vi.fn(),
  primaryCalendarName: vi.fn(),
}));
vi.mock("@/integrations/google/oauth", async (actual) => ({
  ...(await actual<typeof import("@/integrations/google/oauth")>()),
  ...google,
}));

const CLIENT = {
  clientId: "1234567890-abcdefgh.apps.googleusercontent.com",
  clientSecret: "GOCSPX-the-secret",
};
const SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", CALENDAR_READ];
const inAnHour = () => new Date(Date.now() + 3_600_000);

const granted = (overrides = {}) => ({
  accessToken: "ya29.access",
  refreshToken: "1//refresh",
  expiresAt: inAnHour(),
  scopes: SCOPES,
  email: "owner@gmail.test",
  ...overrides,
});

async function connected(ownerId: string) {
  await saveGoogleClient(ownerId, CLIENT);
  google.exchangeCode.mockResolvedValueOnce(granted());
  await completeGoogleConnect(ownerId, "code", "verifier");
}

const storedConnection = async (ownerId: string) =>
  (await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.ownerId, ownerId)))[0];

describe("googleClientInput", () => {
  it("takes a Google client ID and a secret", () => {
    expect(googleClientInput.parse({ ...CLIENT, clientId: ` ${CLIENT.clientId} ` })).toEqual(
      CLIENT,
    );
  });

  it.each([
    ["an ID from elsewhere", { clientId: "my-client" }],
    ["an empty secret", { clientSecret: "  " }],
    ["a secret with a space", { clientSecret: "two words" }],
    ["an unexpected field", { redirectUri: "https://evil.test" }],
  ])("refuses %s", (_label, override) => {
    expect(googleClientInput.safeParse({ ...CLIENT, ...override }).success).toBe(false);
  });
});

describe("the Google client", () => {
  let ownerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("stores the secret sealed and shows only the ID's end", async () => {
    await saveGoogleClient(ownerId, CLIENT);
    const [row] = await db.select().from(integrationClients);
    expect(row.clientSecretEnc).not.toContain("GOCSPX");
    expect(await googleClientStatus(ownerId)).toMatchObject({
      idEnding: "efgh",
      readable: true,
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "integration.client_save",
      after: { provider: "google", clientIdEnding: "efgh" },
    });
    expect(JSON.stringify(rows)).not.toContain("GOCSPX");
  });

  it("says when the client was sealed with another key", async () => {
    const sealed = encryptSecret("x", "another-key-0123456789abcdef0123456");
    await db.insert(integrationClients).values({
      ownerId,
      provider: "google",
      clientId: CLIENT.clientId,
      clientSecretEnc: sealed.value,
      keyVersion: sealed.keyVersion,
    });
    expect((await googleClientStatus(ownerId))?.readable).toBe(false);
  });

  it("asks Google only for the calendar, offline, with consent shown", async () => {
    expect(await startGoogleConnect(ownerId)).toBeNull();
    await saveGoogleClient(ownerId, CLIENT);
    const started = await startGoogleConnect(ownerId);
    const params = started!.url.searchParams;
    expect(started!.url.origin).toBe("https://accounts.google.com");
    expect(params.get("client_id")).toBe(CLIENT.clientId);
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/google/callback",
    );
    expect(params.get("scope")).toBe(`openid email ${CALENDAR_READ}`);
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("state")).toBe(started!.state);
    expect(params.get("code_challenge_method")).toBe("S256");
  });

  it("disconnects first when a different client replaces it", async () => {
    await connected(ownerId);
    await saveGoogleClient(ownerId, { ...CLIENT, clientSecret: "GOCSPX-new" });
    expect((await storedConnection(ownerId)).status).toBe("connected");

    await saveGoogleClient(ownerId, {
      ...CLIENT,
      clientId: "999-zzzz.apps.googleusercontent.com",
    });
    expect(google.revokeGrant).toHaveBeenCalledOnce();
    expect((await storedConnection(ownerId)).status).toBe("revoked");
  });

  it("removing it disconnects and forgets both", async () => {
    await connected(ownerId);
    await removeGoogleClient(ownerId);
    expect(google.revokeGrant).toHaveBeenCalledOnce();
    expect(await db.select().from(integrationClients)).toEqual([]);
    expect(await db.select().from(integrationConnections)).toEqual([]);
    const actions = (await listAudit(ownerId)).rows.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining(["integration.client_remove", "integration.disconnect"]),
    );
  });
});

describe("connecting", () => {
  let ownerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  it("refuses without a client", async () => {
    expect(await completeGoogleConnect(ownerId, "code", "verifier")).toEqual({
      ok: false,
      reason: "no_client",
    });
  });

  it("stores the tokens sealed and audits who connected, never the tokens", async () => {
    await saveGoogleClient(ownerId, CLIENT);
    google.exchangeCode.mockResolvedValueOnce(granted());
    expect(await completeGoogleConnect(ownerId, "code", "verifier")).toEqual({ ok: true });
    expect(google.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: CLIENT.clientSecret }),
      "code",
      "verifier",
    );

    const row = await storedConnection(ownerId);
    expect(row).toMatchObject({ status: "connected", accountEmail: "owner@gmail.test" });
    expect(row.refreshTokenEnc).not.toContain("refresh");
    expect(row.accessTokenEnc).not.toContain("ya29");
    expect(await googleAccessToken(ownerId)).toBe("ya29.access");

    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "integration.connect",
      after: { accountEmail: "owner@gmail.test", scopes: SCOPES },
    });
    expect(JSON.stringify(rows)).not.toMatch(/ya29|1\/\/refresh/);
    expect(await googleConnection(ownerId)).not.toHaveProperty("refreshTokenEnc");
  });

  it("refuses, and gives the access back, when the calendar box was unticked", async () => {
    await saveGoogleClient(ownerId, CLIENT);
    google.exchangeCode.mockResolvedValueOnce(granted({ scopes: ["openid"] }));
    expect(await completeGoogleConnect(ownerId, "code", "verifier")).toEqual({
      ok: false,
      reason: "calendar_not_granted",
    });
    expect(google.revokeGrant).toHaveBeenCalledWith(expect.anything(), "1//refresh");
    expect(await storedConnection(ownerId)).toBeUndefined();
  });

  it("refuses an answer without a refresh token", async () => {
    await saveGoogleClient(ownerId, CLIENT);
    google.exchangeCode.mockResolvedValueOnce(granted({ refreshToken: null }));
    expect(await completeGoogleConnect(ownerId, "code", "verifier")).toEqual({
      ok: false,
      reason: "incomplete",
    });
  });

  it("keeps each owner's connection to themselves", async () => {
    await connected(ownerId);
    const other = await createTestOwner("other@example.com");
    expect(await googleConnection(other)).toBeNull();
    await expect(googleAccessToken(other)).rejects.toThrow("not connected");
    await disconnectGoogle(other);
    expect((await storedConnection(ownerId)).status).toBe("connected");
  });
});

describe("using the connection", () => {
  let ownerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetDatabase();
    ownerId = await createTestOwner();
    await connected(ownerId);
  });

  it("refreshes an access token about to run out", async () => {
    await db
      .update(integrationConnections)
      .set({ accessExpiresAt: new Date(Date.now() + 30_000), lastRefreshAt: null });
    google.refreshAccess.mockResolvedValueOnce({
      accessToken: "ya29.fresh",
      expiresAt: inAnHour(),
      scopes: SCOPES,
    });
    expect(await googleAccessToken(ownerId)).toBe("ya29.fresh");
    expect(google.refreshAccess).toHaveBeenCalledWith(expect.anything(), "1//refresh");
    expect((await storedConnection(ownerId)).lastRefreshAt).not.toBeNull();
    expect(await googleAccessToken(ownerId)).toBe("ya29.fresh");
    expect(google.refreshAccess).toHaveBeenCalledOnce();
  });

  it("marks the connection expired when Google revoked it, and says so", async () => {
    google.refreshAccess.mockRejectedValueOnce(new GrantRevokedError("Token has been revoked."));
    const result = await testGoogleConnection(ownerId);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/Reconnect/) });

    const row = await storedConnection(ownerId);
    expect(row).toMatchObject({ status: "expired", lastError: "Token has been revoked." });
    expect(row.refreshTokenEnc).toBeNull();
    expect(await googleNeedsReconnect(ownerId)).toBe(true);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "integration.expire",
      actor: "system",
    });
    await expect(googleAccessToken(ownerId)).rejects.toThrow("not connected");
  });

  it("tests by reading the primary calendar's name", async () => {
    google.refreshAccess.mockResolvedValue({
      accessToken: "ya29.fresh",
      expiresAt: inAnHour(),
      scopes: SCOPES,
    });
    google.primaryCalendarName.mockResolvedValueOnce("owner@gmail.test");
    expect(await testGoogleConnection(ownerId)).toEqual({
      ok: true,
      calendar: "owner@gmail.test",
    });
    google.primaryCalendarName.mockRejectedValueOnce(new GoogleApiError(403));
    expect(await testGoogleConnection(ownerId)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Calendar API is enabled/),
    });
  });

  it("disconnecting gives the access back and clears the tokens", async () => {
    await disconnectGoogle(ownerId);
    expect(google.revokeGrant).toHaveBeenCalledWith(expect.anything(), "1//refresh");
    const row = await storedConnection(ownerId);
    expect(row).toMatchObject({ status: "revoked", refreshTokenEnc: null, accessTokenEnc: null });
    expect(await googleNeedsReconnect(ownerId)).toBe(false);
  });

  it("disconnects even when Google can't be reached to take the access back", async () => {
    google.revokeGrant.mockRejectedValueOnce(new Error("offline"));
    await disconnectGoogle(ownerId);
    expect((await storedConnection(ownerId)).status).toBe("revoked");
  });

  it("queues one daily check for a connection not refreshed in a day", async () => {
    await enqueueGoogleChecks();
    expect(await db.select().from(jobs)).toEqual([]);

    await db
      .update(integrationConnections)
      .set({ lastRefreshAt: new Date(Date.now() - 25 * 3_600_000) });
    await enqueueGoogleChecks();
    await enqueueGoogleChecks();
    const queued = await db.select().from(jobs);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "google.check", ownerId });
  });
});
