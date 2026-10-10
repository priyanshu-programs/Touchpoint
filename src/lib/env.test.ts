import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
  CRON_SECRET: "b".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a complete environment and defaults NODE_ENV", () => {
    expect(parseEnv(valid)).toEqual({ ...valid, NODE_ENV: "development" });
  });

  it("names every missing variable", () => {
    expect(() => parseEnv({ APP_URL: valid.APP_URL })).toThrow(
      /DATABASE_URL, AUTH_SECRET, CRON_SECRET/,
    );
  });

  it("rejects short secrets without echoing their value", () => {
    const attempt = () => parseEnv({ ...valid, AUTH_SECRET: "too-short" });
    expect(attempt).toThrow(/AUTH_SECRET/);
    expect(attempt).not.toThrow(/too-short/);
  });

  it("rejects a malformed URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(
      /APP_URL/,
    );
  });
});
