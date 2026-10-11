import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetcher, isPublicAddress, safeFetch } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "127.8.8.8",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "not an address",
    "",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "172.15.0.1",
    "172.32.0.1",
    "100.63.255.255",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("fetching", () => {
  let server: http.Server;
  let base: string;
  // The guard is what stops loopback, so transport is tested with it open.
  const openFetch = createFetcher(() => true);
  const options = () => ({ maxBytes: 1000, deadline: Date.now() + 5_000 });

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const path = request.url ?? "/";
      if (path === "/page") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<title>Hello</title>");
      } else if (path === "/gzip") {
        response.setHeader("content-encoding", "gzip");
        response.end(zlib.gzipSync("x".repeat(5000)));
      } else if (path === "/big") {
        response.end("y".repeat(5000));
      } else if (path.startsWith("/hop/")) {
        const left = Number(path.slice(5));
        response.statusCode = 302;
        response.setHeader("location", left > 0 ? `/hop/${left - 1}` : "/page");
        response.end();
      } else if (path === "/to-file") {
        response.statusCode = 302;
        response.setHeader("location", "file:///etc/passwd");
        response.end();
      } else if (path === "/slow") {
        // Never answers.
      } else {
        response.statusCode = 404;
        response.end("missing");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it("returns the body, status and content type", async () => {
    const result = await openFetch(`${base}/page`, options());

    expect(result).toMatchObject({
      url: `${base}/page`,
      status: 200,
      contentType: "text/html; charset=utf-8",
      truncated: false,
    });
    expect(result.body.toString()).toBe("<title>Hello</title>");
  });

  it("reports a missing page by its status instead of failing", async () => {
    expect((await openFetch(`${base}/nope`, options())).status).toBe(404);
  });

  it("follows redirects and reports where it ended", async () => {
    const result = await openFetch(`${base}/hop/2`, options());
    expect(result.url).toBe(`${base}/page`);
  });

  it("gives up after three redirects", async () => {
    await expect(openFetch(`${base}/hop/3`, options())).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("will not follow a redirect to another scheme", async () => {
    await expect(openFetch(`${base}/to-file`, options())).rejects.toMatchObject({
      code: "blocked",
    });
  });

  it("stops reading at the size cap", async () => {
    const result = await openFetch(`${base}/big`, options());
    expect(result.body).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it("applies the size cap to the decompressed body", async () => {
    const result = await openFetch(`${base}/gzip`, options());
    expect(result.body.toString()).toBe("x".repeat(1000));
    expect(result.truncated).toBe(true);
  });

  it("times out at the caller's deadline", async () => {
    await expect(
      openFetch(`${base}/slow`, { maxBytes: 1000, deadline: Date.now() + 300 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports a host that does not exist as unreachable", async () => {
    await expect(
      safeFetch("https://nowhere.invalid/", options()),
    ).rejects.toMatchObject({ code: "unreachable" });
  });

  it.each([
    ["a loopback address", () => `${base}/page`],
    ["loopback on a web port", () => "http://127.0.0.1/"],
    ["a name that resolves to loopback", () => "http://localhost/"],
    ["a private address", () => "http://192.168.1.1/"],
    ["the cloud metadata address", () => "http://169.254.169.254/latest/"],
    ["an address written as a number", () => "http://2130706433/"],
    ["an IPv6 loopback address", () => "http://[::1]/"],
    ["a public host on another port", () => "http://8.8.8.8:8080/"],
    ["credentials in the address", () => "https://user:pass@example.com/"],
    ["another scheme", () => "ftp://example.com/"],
  ])("refuses %s", async (_label, url) => {
    await expect(safeFetch(url(), options())).rejects.toMatchObject({
      code: "blocked",
    });
  });
});
