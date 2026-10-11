import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetcher, FetchError, type Fetcher } from "@/lib/safe-fetch";
import { extract } from "./extract";
import { imageType } from "./image";
import { extractPeople, listPeople } from "./people";
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

  it("reads the phone and email the company states about itself", () => {
    const found = extract(
      `<a href="tel:+1-555-000-0000">Sales</a>
       <a href="mailto:someone@agency.test">Site by</a>
       <script type="application/ld+json">
        {"@type":"Organization","telephone":"+91 (20) 5550-1234",
         "contactPoint":[{"@type":"ContactPoint","email":"mailto:Hello@Acme.test"}]}
       </script>`,
      base,
    );

    expect(found).toMatchObject({
      phone: "+91 (20) 5550-1234",
      email: "hello@acme.test",
    });
  });

  it("falls back to the page's phone and email links, preferring an address at its own domain", () => {
    const found = extract(
      `<a href="mailto:someone@agency.test">Site by</a>
       <a href="MAILTO:Hello@acme.test?subject=Hi%20there">Write to us</a>
       <a href="tel:call-us">Call</a>
       <a href="tel:%2B91%2020%205550%201234">Call</a>
       <a href="/blog/contact-lenses/review">Post</a>
       <a href="https://elsewhere.test/contact">Partner</a>
       <a href="/en/contact-us/#form">Contact</a>
       <a href="/contact">Contact</a>`,
      base,
    );

    expect(found).toMatchObject({
      phone: "+91 20 5550 1234",
      email: "hello@acme.test",
      contactPage: "https://www.acme.test/en/contact-us/",
    });
    expect(
      extract(`<a href="mailto:someone@agency.test">Site by</a>`, base).email,
    ).toBe("someone@agency.test");
  });

  it("takes nothing that is not a phone number or an email address", () => {
    const found = extract(
      `<a href="tel:<script>alert(1)</script>">x</a>
       <a href="tel:12345">x</a>
       <a href="tel:${"1".repeat(30)}">x</a>
       <a href="mailto:not an address">x</a>
       <a href="mailto:a@acme.test,b@acme.test">x</a>
       <a href="javascript:location='/contact'">x</a>
       <script type="application/ld+json">
        {"@type":"Organization","telephone":{"@value":"+15550000000"},"email":["x"]}
       </script>`,
      base,
    );

    expect(found).toMatchObject({ phone: null, email: null, contactPage: null });
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

  it("finds the site's own team page and the people its JSON-LD names", () => {
    const found = extract(
      `<a href="https://elsewhere.test/team">Partner's team</a>
       <a href="/blog/team-building/tips">Post</a>
       <a href="/about/our-team/#founders">Our team</a>
       <a href="/people">People</a>
       <script type="application/ld+json">
        {"@type":"Organization",
         "founder":{"@type":"Person","name":" Asha  Rao ","jobTitle":"Founder"},
         "employee":[{"@type":"Person","name":"Vikram Shah"},{"name":42},"Someone"]}
       </script>`,
      base,
    );

    expect(found.teamPage).toBe("https://www.acme.test/about/our-team/");
    expect(found.staff).toEqual([
      { name: "Asha Rao", title: "Founder" },
      { name: "Vikram Shah", title: null },
    ]);
    expect(extract(`<a href="/contact">Contact</a>`, base)).toMatchObject({
      teamPage: null,
      staff: [],
    });
  });
});

describe("extractPeople", () => {
  // The shape of the page that prompted this: site links first, then the team.
  const teamPage = `
    <header><h2>Acme Design</h2></header>
    <footer>
      <h3>THE STUDIO</h3><ul><li><a href="/about">About Us</a></li></ul>
      <h3>FINE PRINT</h3><ul><li><a href="/privacy">Privacy Policy</a></li></ul>
    </footer>
    <h2>Our Team</h2><p>The people behind it all</p>
    <div><div>AR</div><div><h3 class="x">Mrs. Asha Rao</h3><p>Founder</p></div></div>
    <div><div>VS</div><div><h3>Mr Vikram <span>Shah</span></h3><p>Design <b>Lead</b> &amp; Partner</p></div></div>
    <div><div>MD</div><div><h3>Ms. Meera D'Souza</h3><p>Part of the team</p></div></div>`;

  it("reads names in headings with the role under each", () => {
    expect(extractPeople(teamPage)).toEqual([
      { name: "Asha Rao", title: "Founder" },
      { name: "Vikram Shah", title: "Design Lead & Partner" },
      { name: "Meera D'Souza", title: "Part of the team" },
    ]);
  });

  it("takes a lone founder, and nobody from headings without a position among them", () => {
    expect(
      extractPeople(`<h2>Our Story</h2><p>Since 1990</p><h4>Asha Rao</h4><span>Co-Founder</span>`),
    ).toEqual([{ name: "Asha Rao", title: "Co-Founder" }]);
    expect(
      extractPeople(
        `<h3>Priya Sharma</h3><p>The quality feels premium.</p>
         <h3>Ananya Roy</h3><p>It exceeded expectations.</p>`,
      ),
    ).toEqual([]);
  });

  it("leaves out what is not a name and keeps a biography out of the role", () => {
    expect(
      extractPeople(
        `<h3>Asha Rao</h3><p>Managing Director</p>
         <h3>careers at acme</h3><p>Head of nothing</p>
         <h3>Five Words Are Too Many</h3><p>Manager</p>
         <h3>R2 D2</h3><p>Director</p>
         <h3><script>alert(1)</script></h3><p>Owner</p>
         <h3>Vikram Shah</h3><style>p{color:red}</style><p>${"Long ago. ".repeat(40)}</p>`,
      ),
    ).toEqual([
      { name: "Asha Rao", title: "Managing Director" },
      { name: "Vikram Shah", title: null },
    ]);
  });

  it("lists each person once, without honorifics, and stops at twelve", () => {
    expect(
      listPeople([
        { name: "Dr. Asha Rao", title: "Founder" },
        { name: "asha rao", title: "Director" },
        { name: "Mr. ", title: null },
      ]),
    ).toEqual([{ name: "Asha Rao", title: "Founder" }]);
    expect(
      listPeople(
        Array.from({ length: 30 }, (_, index) => ({
          name: `Person ${index}`,
          title: null,
        })),
      ),
    ).toHaveLength(12);
  });

  it("does not slow down on a hostile page", () => {
    const started = Date.now();
    extractPeople(`<h3>${"A ".repeat(100_000)}</h3>${"<h3>Aa Bb</h3><p>x</p>".repeat(20_000)}`);
    expect(Date.now() - started).toBeLessThan(2_000);
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
        people: [],
      },
    });
  });

  it("reads the team page for the company's people", async () => {
    const result = await readWebsite(
      "https://acme.test",
      site({
        "https://acme.test/": page(
          `<a href="/our-team">Our team</a>
           <script type="application/ld+json">
            {"@type":"Organization","founder":[{"name":"Asha Rao","jobTitle":"CEO"},{"name":"Kabir Mehta"}]}
           </script>`,
        ),
        "https://acme.test/our-team": page(
          `<h3>Mrs. Asha Rao</h3><p>Founder</p><h3>Vikram Shah</h3><p>Design Lead</p>`,
        ),
      }),
    );

    expect(result.ok && result.reading.people).toEqual([
      { name: "Asha Rao", title: "Founder" },
      { name: "Vikram Shah", title: "Design Lead" },
      { name: "Kabir Mehta", title: null },
    ]);
  });

  it.each([
    [
      "the site asks readers to keep out of it",
      {
        "https://acme.test/robots.txt": {
          status: 200,
          contentType: "text/plain",
          body: Buffer.from("User-agent: *\nDisallow: /team"),
        },
      },
    ],
    [
      "it forwards to another site",
      {
        "https://acme.test/team": {
          status: 200,
          contentType: "text/html",
          body: Buffer.from(`<h3>Asha Rao</h3><p>Founder</p>`),
          url: "https://hiring.test/acme",
        },
      },
    ],
    ["it is missing", { "https://acme.test/team": { status: 404 } }],
  ])("goes without the team page when %s", async (_label, pages) => {
    const result = await readWebsite(
      "https://acme.test",
      site({
        "https://acme.test/": page(
          `<meta name="description" content="Anvils"><a href="/team">Team</a>`,
        ),
        "https://acme.test/team": page(`<h3>Asha Rao</h3><p>Founder</p>`),
        ...pages,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      reading: { fields: { description: "Anvils" }, people: [] },
    });
  });

  it("keeps the rest of the read when the team page cannot be fetched", async () => {
    const pages = site({
      "https://acme.test/": page(
        `<meta name="description" content="Anvils"><a href="/team">Team</a>`,
      ),
    });
    const result = await readWebsite("https://acme.test", async (url, options) => {
      if (url.endsWith("/team")) throw new FetchError("timeout");
      return pages(url, options);
    });

    expect(result).toMatchObject({
      ok: true,
      reading: { fields: { description: "Anvils" }, people: [] },
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

  it("reads the contact page for the contact details the home page leaves out", async () => {
    const seen: string[] = [];
    const pages = site({
      "https://acme.test/": page(
        `<meta name="description" content="Anvils">
         <a href="mailto:hello@acme.test">Write</a><a href="/contact">Contact</a>`,
      ),
      "https://acme.test/contact": page(
        `<meta name="description" content="Get in touch">
         <a href="mailto:support@acme.test">Support</a><a href="tel:+91 20 5550 1234">Call</a>
         <script type="application/ld+json">
          {"@type":"LocalBusiness","address":{"addressLocality":"Pune","addressCountry":"India"}}
         </script>`,
      ),
    });
    const result = await readWebsite("https://acme.test", (url, options) => {
      seen.push(url);
      return pages(url, options);
    });

    expect(result).toMatchObject({
      ok: true,
      reading: {
        fields: {
          website: "https://acme.test",
          description: "Anvils",
          email: "hello@acme.test",
          phone: "+91 20 5550 1234",
          city: "Pune",
          country: "India",
        },
      },
    });
    expect(seen.at(-1)).toBe("https://acme.test/contact");
  });

  it.each([
    [
      "the site asks readers to keep out of it",
      {
        "https://acme.test/robots.txt": {
          status: 200,
          contentType: "text/plain",
          body: Buffer.from("User-agent: *\nDisallow: /contact"),
        },
      },
    ],
    [
      "it forwards to another site",
      {
        "https://acme.test/contact": {
          status: 200,
          contentType: "text/html",
          body: Buffer.from(`<a href="tel:+91 20 5550 1234">Call</a>`),
          url: "https://forms.test/acme",
        },
      },
    ],
    ["it is missing", { "https://acme.test/contact": { status: 404 } }],
  ])("goes without the contact page when %s", async (_label, pages) => {
    const result = await readWebsite(
      "https://acme.test",
      site({
        "https://acme.test/": page(`<a href="/contact">Contact</a>`),
        "https://acme.test/contact": page(`<a href="tel:+91 20 5550 1234">Call</a>`),
        ...pages,
      }),
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.reading.fields).toEqual({
      website: "https://acme.test",
    });
  });

  it("keeps the home page's details when the contact page cannot be fetched", async () => {
    const pages = site({
      "https://acme.test/": page(
        `<meta name="description" content="Anvils"><a href="/contact">Contact</a>`,
      ),
    });
    const result = await readWebsite("https://acme.test", async (url, options) => {
      if (url.endsWith("/contact")) throw new FetchError("timeout");
      return pages(url, options);
    });

    expect(result).toMatchObject({
      ok: true,
      reading: { fields: { description: "Anvils" } },
    });
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
