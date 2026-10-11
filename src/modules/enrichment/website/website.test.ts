import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetcher, FetchError, type Fetcher } from "@/lib/safe-fetch";
import { extract } from "./extract";
import { imageType } from "./image";
import { readWebsite } from "./read";
import { robotsAllows } from "./robots";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("imageType", () => {
  it.each([
    ["image/png", PNG],
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ["image/gif", Buffer.from("GIF89a")],
    ["image/webp", Buffer.from("RIFF\0\0\0\0WEBPVP8 ")],
    ["image/x-icon", Buffer.from([0, 0, 1, 0, 1, 0])],
  ])("recognises %s", (type, bytes) => {
    expect(imageType(bytes)).toBe(type);
  });

  it.each([
    ["an SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")],
    ["a web page", Buffer.from("<!doctype html><html>")],
    ["nothing", Buffer.alloc(0)],
  ])("refuses %s", (_label, bytes) => {
    expect(imageType(bytes)).toBeNull();
  });
});

describe("robotsAllows", () => {
  it("allows everything when there are no rules", () => {
    expect(robotsAllows("", "/")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow:", "/")).toBe(true);
  });

  it("obeys a site that shuts everyone out", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /*", "/")).toBe(false);
  });

  it("lets the longest matching rule win", () => {
    const rules = "User-agent: *\nDisallow: /\nAllow: /$\nAllow: /favicon.ico";
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/favicon.ico")).toBe(true);
    expect(robotsAllows(rules, "/about")).toBe(false);
  });

  it("prefers the group that names this reader", () => {
    const rules = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: Googlebot",
      "User-agent: Touchpoint",
      "Disallow: /private/ # not for anyone",
    ].join("\r\n");
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
  });

  it("ignores groups for other readers", () => {
    expect(robotsAllows("User-agent: BadBot\nDisallow: /", "/")).toBe(true);
  });

  it("matches wildcards without slowing down on a hostile pattern", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /*.png$", "/a/logo.png")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /*.png$", "/a/logo.png?x")).toBe(true);
    const hostile = `User-agent: *\nDisallow: /${"*a".repeat(5000)}b`;
    const started = Date.now();
    expect(robotsAllows(hostile, `/${"a".repeat(5000)}`)).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("extract", () => {
  const base = "https://www.acme.test/";

  it("reads the description and icons from plain tags", () => {
    const found = extract(
      `<html><head>
        <meta name="Description" content="  We make &amp; mend\n anvils.  ">
        <meta property="og:description" content="Second choice">
        <link rel="icon" sizes="32x32" href="/small.png">
        <link rel="shortcut icon" sizes="16x16 64x64" href="//cdn.acme.test/big.png">
        <link rel="apple-touch-icon" href="touch.png">
        <link rel="icon" type="image/svg+xml" href="/logo.svg">
        <link rel="stylesheet" href="/site.css">
      </head></html>`,
      base,
    );

    expect(found.description).toBe("We make & mend anvils.");
    expect(found.icons).toEqual([
      "https://www.acme.test/touch.png",
      "https://cdn.acme.test/big.png",
      "https://www.acme.test/small.png",
      "https://www.acme.test/favicon.ico",
    ]);
    expect(found).toMatchObject({ city: null, region: null, country: null, links: [] });
  });

  it("falls back to Open Graph, then to JSON-LD", () => {
    expect(
      extract(`<meta property="og:description" content="From OG">`, base).description,
    ).toBe("From OG");
    expect(
      extract(
        `<script type="application/ld+json">{"@type":"Organization","description":"From JSON-LD"}</script>`,
        base,
      ).description,
    ).toBe("From JSON-LD");
  });

  it("reads the address and profiles from JSON-LD, wherever the node sits", () => {
    const found = extract(
      `<script type="application/ld+json">not json</script>
       <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"WebSite","name":"Acme"},
          {"@type":["Thing","LocalBusiness"],
           "address":{"@type":"PostalAddress","addressLocality":"Pune",
             "addressRegion":"Maharashtra","addressCountry":{"@type":"Country","name":"India"}},
           "sameAs":["https://www.linkedin.com/company/acme","javascript:alert(1)","https://www.linkedin.com/company/acme"]}
        ]}
       </script>`,
      base,
    );

    expect(found).toMatchObject({
      city: "Pune",
      region: "Maharashtra",
      country: "India",
      links: ["https://www.linkedin.com/company/acme"],
    });
  });

  it("treats page text as text: no markup, control characters or overlong values", () => {
    const found = extract(
      `<meta name="description" content="<script>alert(1)</script>\u0000\u0007 ${"x".repeat(3000)}">
       <link rel="icon" href="javascript:alert(1)">
       <link rel="icon" href="data:image/png;base64,AAAA">`,
      base,
    );

    expect(found.description).toHaveLength(2000);
    expect(found.description).toMatch(/^<script>alert\(1\)<\/script> x+$/);
    expect(found.icons).toEqual(["https://www.acme.test/favicon.ico"]);
  });

  it("survives a page that is not really HTML", () => {
    expect(extract("\u0000\u0001<<<>>><meta <link", base).description).toBeNull();
  });
});

describe("readWebsite", () => {
  const page = (body: string, contentType = "text/html; charset=utf-8") => ({
    status: 200,
    contentType,
    body: Buffer.from(body),
    truncated: false,
  });
  // Answers from a table of addresses; anything else is a 404.
  const site =
    (pages: Record<string, Partial<Awaited<ReturnType<Fetcher>>>>): Fetcher =>
    async (url) => ({
      url,
      status: 404,
      contentType: "",
      body: Buffer.alloc(0),
      truncated: false,
      ...pages[url],
    });

  it("returns what the home page says and the first usable logo", async () => {
    const result = await readWebsite(
      "https://acme.test/about?x=1",
      site({
        "https://acme.test/": {
          ...page(
            `<meta name="description" content="Anvils"><link rel="icon" href="/logo.svg.png">
             <link rel="apple-touch-icon" href="/touch.png">`,
          ),
          url: "https://www.acme.test/en",
        },
        "https://www.acme.test/touch.png": page("<html>not an image</html>"),
        "https://www.acme.test/logo.svg.png": { status: 200, body: PNG },
      }),
    );

    expect(result).toEqual({
      ok: true,
      reading: {
        fields: { website: "https://www.acme.test", description: "Anvils" },
        links: [],
        logo: {
          contentType: "image/png",
          bytes: PNG,
          sourceUrl: "https://www.acme.test/logo.svg.png",
        },
      },
    });
  });

  it("goes without a logo when none can be used", async () => {
    const result = await readWebsite(
      "https://acme.test",
      site({
        "https://acme.test/": page(`<link rel="icon" href="/big.png">`),
        "https://acme.test/big.png": { status: 200, body: PNG, truncated: true },
        "https://acme.test/favicon.ico": {
          status: 200,
          body: Buffer.from("<svg/>"),
        },
      }),
    );

    expect(result).toMatchObject({ ok: true, reading: { logo: null } });
  });

  it.each([
    [
      "robots",
      "a site that shuts readers out",
      { "https://acme.test/robots.txt": page("User-agent: *\nDisallow: /", "text/plain") },
    ],
    [
      "robots",
      "a robots file the server cannot produce",
      { "https://acme.test/robots.txt": { status: 503 } },
    ],
    ["refused", "a home page the site will not serve", {}],
    [
      "not_html",
      "an address that returns something else",
      { "https://acme.test/": page("{}", "application/json") },
    ],
    [
      "moved",
      "a domain that forwards to another site",
      { "https://acme.test/": { ...page("<html>"), url: "https://parking.test/acme" } },
    ],
  ] as const)("reports %s for %s", async (error, _label, pages) => {
    expect(await readWebsite("https://acme.test", site(pages))).toEqual({
      ok: false,
      error,
    });
  });

  it("reports why the site could not be fetched", async () => {
    const blocked: Fetcher = async () => {
      throw new FetchError("blocked");
    };
    expect(await readWebsite("https://acme.test", blocked)).toEqual({
      ok: false,
      error: "blocked",
    });
  });

  describe("over a real connection", () => {
    let server: http.Server;
    let base: string;

    beforeAll(async () => {
      server = http.createServer((request, response) => {
        if (request.url === "/") {
          response.setHeader("content-type", "text/html");
          response.end(
            `<meta name="description" content="Served for real"><link rel="icon" href="/icon.png">`,
          );
        } else if (request.url === "/icon.png") {
          response.end(PNG);
        } else {
          response.statusCode = 404;
          response.end();
        }
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

    it("reads a page and its logo", async () => {
      const result = await readWebsite(base, createFetcher(() => true));

      expect(result).toMatchObject({
        ok: true,
        reading: {
          fields: { website: base, description: "Served for real" },
          logo: { contentType: "image/png", sourceUrl: `${base}/icon.png` },
        },
      });
    });

    it("refuses the same address through the guarded fetcher", async () => {
      expect(await readWebsite(base)).toEqual({ ok: false, error: "blocked" });
    });
  });
});
