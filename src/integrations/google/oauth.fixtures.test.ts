import { afterEach, describe, expect, it, vi } from "vitest";
import answers from "./fixtures/answers.json";
import { exchangeCode, GrantRevokedError, refreshAccess } from "./oauth";

const client = {
  clientId: "1234567890-abc.apps.googleusercontent.com",
  clientSecret: "secret",
  redirectUri: "http://localhost:3000/api/integrations/google/callback",
};

const stub = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );

afterEach(() => vi.unstubAllGlobals());

describe("Google's token answers, through arctic", () => {
  it("reads a first grant: tokens, scopes and who connected", async () => {
    stub(200, answers.tokenGranted);
    const granted = await exchangeCode(client, "code", "verifier");
    expect(granted.accessToken).toBe(answers.tokenGranted.access_token);
    expect(granted.refreshToken).toBe(answers.tokenGranted.refresh_token);
    expect(granted.email).toBe("person1@example.test");
    expect(granted.scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(granted.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reads a refresh, which brings no new refresh token", async () => {
    stub(200, answers.tokenRefreshed);
    const fresh = await refreshAccess(client, "refresh");
    expect(fresh.accessToken).toBe(answers.tokenRefreshed.access_token);
    expect(fresh.scopes).toContain("openid");
  });

  it("turns invalid_grant into a revoked grant", async () => {
    stub(400, answers.tokenRevoked);
    await expect(refreshAccess(client, "refresh")).rejects.toBeInstanceOf(GrantRevokedError);
  });
});
