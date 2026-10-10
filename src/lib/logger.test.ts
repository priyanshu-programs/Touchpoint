import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, redact } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("redact", () => {
  it("masks sensitive keys at any depth", () => {
    expect(
      redact({
        email: "a@b.co",
        password: "hunter2",
        headers: { Authorization: "Bearer x", cookie: "sid=1" },
        items: [{ refreshToken: "t", apiKey: "k", note: "ok" }],
      }),
    ).toEqual({
      email: "a@b.co",
      password: "[redacted]",
      headers: { Authorization: "[redacted]", cookie: "[redacted]" },
      items: [{ refreshToken: "[redacted]", apiKey: "[redacted]", note: "ok" }],
    });
  });

  it("serialises errors", () => {
    expect(redact({ error: new TypeError("boom") })).toMatchObject({
      error: { name: "TypeError", message: "boom" },
    });
  });
});

describe("logger", () => {
  it("writes one JSON line with level, time and event", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("auth.sign_in", { userId: "u1", token: "abc" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: "info",
      event: "auth.sign_in",
      userId: "u1",
      token: "[redacted]",
    });
    expect(Number.isNaN(Date.parse(line.time))).toBe(false);
  });

  it("routes errors to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("job.failed", { error: new Error("x") });
    expect(spy).toHaveBeenCalledOnce();
  });
});
