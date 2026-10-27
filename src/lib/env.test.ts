import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
  CRON_SECRET: "b".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a complete environment and defaults the rest", () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: "development",
      WEBSITE_RENDERER: "jina",
    });
  });

  it("lets the outside page reader be turned off, and nothing else be named", () => {
    expect(parseEnv({ ...valid, WEBSITE_RENDERER: "off" }).WEBSITE_RENDERER).toBe("off");
    expect(() => parseEnv({ ...valid, WEBSITE_RENDERER: "browser" })).toThrow(
      /WEBSITE_RENDERER/,
    );
  });

  it("treats the search key as optional, and a blank one as not set", () => {
    expect(parseEnv(valid).TAVILY_API_KEY).toBeUndefined();
    expect(parseEnv({ ...valid, TAVILY_API_KEY: "" }).TAVILY_API_KEY).toBeUndefined();
    expect(parseEnv({ ...valid, TAVILY_API_KEY: "tvly-abc" }).TAVILY_API_KEY).toBe(
      "tvly-abc",
    );
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

  it("falls back to the Vercel production domain when APP_URL is unset", () => {
    expect(
      parseEnv({
        ...valid,
        APP_URL: undefined,
        VERCEL_PROJECT_PRODUCTION_URL: "touchpoint.vercel.app",
      }).APP_URL,
    ).toBe("https://touchpoint.vercel.app");
    expect(
      parseEnv({ ...valid, VERCEL_PROJECT_PRODUCTION_URL: "other.vercel.app" })
        .APP_URL,
    ).toBe(valid.APP_URL);
  });

  it("uses the branch's address in a preview, unless APP_URL is set", () => {
    const preview = {
      ...valid,
      APP_URL: undefined,
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "touchpoint-git-feat-x.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "touchpoint.vercel.app",
    };
    expect(parseEnv(preview).APP_URL).toBe(
      "https://touchpoint-git-feat-x.vercel.app",
    );
    expect(parseEnv({ ...preview, APP_URL: valid.APP_URL }).APP_URL).toBe(
      valid.APP_URL,
    );
    expect(
      parseEnv({ ...preview, VERCEL_ENV: "production" }).APP_URL,
    ).toBe("https://touchpoint.vercel.app");
  });

  it("rejects a malformed URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(
      /APP_URL/,
    );
  });
});
