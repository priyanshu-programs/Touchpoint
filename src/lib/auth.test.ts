import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "@/test/owner";
import { auth, ownerExists } from "./auth";

const credentials = {
  email: "owner@example.com",
  password: "correct-horse-battery-staple",
};

function signInRequest(password: string) {
  return new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify({ email: credentials.email, password }),
  });
}

function attemptsLogged(calls: unknown[][]) {
  return calls
    .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
    .filter((entry) => entry.event === "auth.attempt");
}

describe("single-owner authentication", () => {
  beforeAll(resetDatabase);

  it("lets the first account in and refuses every later one", async () => {
    expect(await ownerExists()).toBe(false);

    await auth.api.signUpEmail({ body: { name: "Owner", ...credentials } });
    expect(await ownerExists()).toBe(true);

    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Second",
          email: "second@example.com",
          password: "another-long-password-123",
        },
      }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("logs failed and successful sign-ins with the client IP and no credentials", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const failed = await auth.handler(signInRequest("wrong-password-entirely"));
    const succeeded = await auth.handler(signInRequest(credentials.password));

    expect(failed.status).toBe(401);
    expect(succeeded.status).toBe(200);
    expect(succeeded.headers.get("set-cookie")).toMatch(/HttpOnly/i);

    const [first, second] = attemptsLogged(spy.mock.calls);
    expect(first).toMatchObject({
      path: "/sign-in/email",
      success: false,
      ip: "203.0.113.7",
    });
    expect(second).toMatchObject({ success: true, ip: "203.0.113.7" });
    expect(second.userId).toEqual(expect.any(String));
    expect(JSON.stringify([first, second])).not.toContain(credentials.email);
    expect(JSON.stringify([first, second])).not.toContain(credentials.password);
  });
});
