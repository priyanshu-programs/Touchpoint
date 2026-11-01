import { describe, expect, it } from "vitest";
import { buildCsp } from "./proxy";

describe("buildCsp", () => {
  it("allows scripts only by nonce in production", () => {
    const csp = buildCsp("abc123", { isDev: false, isHttps: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("permits eval only in development", () => {
    expect(buildCsp("abc123", { isDev: true, isHttps: false })).toContain(
      "'unsafe-eval'",
    );
  });

  it("does not upgrade requests when the app is served over http", () => {
    expect(
      buildCsp("abc123", { isDev: false, isHttps: false }),
    ).not.toContain("upgrade-insecure-requests");
  });

  it("reaches only this app unless the page is given the live room", () => {
    expect(buildCsp("abc123", { isDev: false, isHttps: true })).toContain("connect-src 'self';");
    expect(
      buildCsp("abc123", { isDev: false, isHttps: true, liveRoom: "wss://room.example" }),
    ).toContain("connect-src 'self' wss://room.example;");
  });
});
