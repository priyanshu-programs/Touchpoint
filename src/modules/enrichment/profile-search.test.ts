import { describe, expect, it } from "vitest";
import { FetchError, type Fetcher, type FetchOptions } from "@/lib/safe-fetch";
import { classifyProfile, searchProfiles } from "./profile-search";

describe("classifyProfile", () => {
  it.each([
    ["https://www.linkedin.com/in/asha-rao-1a2b3c", "linkedin", "https://www.linkedin.com/in/asha-rao-1a2b3c"],
    ["https://in.linkedin.com/in/asha-rao/en?trk=x", "linkedin", "https://www.linkedin.com/in/asha-rao"],
    ["http://linkedin.com/in/asha-rao/", "linkedin", "https://www.linkedin.com/in/asha-rao"],
    ["https://x.com/asha_rao", "x", "https://x.com/asha_rao"],
    ["https://twitter.com/asha_rao?lang=en", "x", "https://x.com/asha_rao"],
    ["https://github.com/asha-rao", "github", "https://github.com/asha-rao"],
    ["https://www.github.com/asha-rao/", "github", "https://github.com/asha-rao"],
  ])("reads %s", (address, kind, url) => {
    expect(classifyProfile(address)).toEqual({ kind, url });
  });

  it.each([
    "https://www.linkedin.com/company/acme",
    "https://www.linkedin.com/posts/asha-rao_hello",
    "https://www.linkedin.com/in/",
    "https://linkedin.com.evil.test/in/asha-rao",
    "https://notlinkedin.com/in/asha-rao",
    "https://x.com/asha_rao/status/123",
    "https://x.com/search",
    "https://x.com/a-name-too-long-to-be-a-handle",
    "https://github.com/asha-rao/project",
    "https://github.com/orgs",
    "https://gist.github.com/asha-rao",
    "https://example.com/asha",
    "javascript:alert(1)",
    "ftp://github.com/asha-rao",
    "not an address",
  ])("drops %s", (address) => {
    expect(classifyProfile(address)).toBeNull();
  });
});

describe("searchProfiles", () => {
  const person = { name: 'Asha "Ash" Rao', company: "Acme Design" };
  const answering =
    (body: unknown, status = 200, seen: [string, FetchOptions][] = []): Fetcher =>
    async (url, options) => {
      seen.push([url, options]);
      return {
        url,
        status,
        contentType: "application/json",
        body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
        truncated: false,
      };
    };

  it("asks once, by name and company, on the three sites, with the key in a header", async () => {
    const seen: [string, FetchOptions][] = [];
    await searchProfiles(person, "tvly-key", answering({ results: [] }, 200, seen));

    expect(seen).toHaveLength(1);
    const [url, options] = seen[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      authorization: "Bearer tvly-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(options.body ?? "")).toEqual({
      query: '"Asha  Ash  Rao" Acme Design',
      search_depth: "basic",
      max_results: 15,
      include_domains: ["linkedin.com", "x.com", "twitter.com", "github.com"],
    });
  });

  it("keeps profiles only, once each, three of a kind at most, with tidy titles", async () => {
    const result = await searchProfiles(
      { name: "Asha Rao", company: null },
      "k",
      answering({
        results: [
          { url: "https://www.linkedin.com/in/asha-rao", title: "Asha Rao\n - Acme  Design" },
          { url: "https://in.linkedin.com/in/Asha-Rao", title: "The same person" },
          { url: "https://www.linkedin.com/company/acme", title: "Acme" },
          { url: "https://www.linkedin.com/in/asha-rao-2", title: "x".repeat(300) },
          { url: "https://www.linkedin.com/in/asha-rao-3" },
          { url: "https://www.linkedin.com/in/asha-rao-4", title: "A fourth" },
          { url: "https://twitter.com/asha_rao", title: null },
          { url: "https://github.com/asha-rao/project", title: "A repository" },
        ],
      }),
    );

    expect(result).toEqual({
      ok: true,
      candidates: [
        { kind: "linkedin", url: "https://www.linkedin.com/in/asha-rao", title: "Asha Rao - Acme Design" },
        { kind: "linkedin", url: "https://www.linkedin.com/in/asha-rao-2", title: "x".repeat(120) },
        { kind: "linkedin", url: "https://www.linkedin.com/in/asha-rao-3", title: null },
        { kind: "x", url: "https://x.com/asha_rao", title: null },
      ],
    });
  });

  it.each([
    ["a refused key", answering({ detail: "Unauthorized" }, 401), 401],
    ["an answer that is not JSON", answering("<html>"), 200],
    ["an answer of another shape", answering({ results: "none" }), 200],
  ])("reports %s as a failure", async (_label, fetcher, status) => {
    expect(await searchProfiles(person, "k", fetcher)).toEqual({ ok: false, status });
  });

  it("reports a service that cannot be reached", async () => {
    const down: Fetcher = async () => {
      throw new FetchError("timeout");
    };
    expect(await searchProfiles(person, "k", down)).toEqual({ ok: false, status: null });
  });
});
