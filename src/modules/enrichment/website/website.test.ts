import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetcher, FetchError, type Fetcher } from "@/lib/safe-fetch";
import { extract } from "./extract";
import { imageType } from "./image";
import { extractPeople, listPeople } from "./people";
import { readWebsite } from "./read";
import { readMarkdown, renderedPage } from "./render";
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
         "founder":{"@type":"Person","name":" Asha  Rao ","jobTitle":"Founder",
           "image":{"@type":"ImageObject","url":"/people/asha.jpg"}},
         "employee":[{"@type":"Person","name":"Vikram Shah","image":"javascript:alert(1)"},
           {"name":"Meera Iyer","image":["https://cdn.acme.test/meera.svg"]},{"name":42},"Someone"]}
       </script>`,
      base,
    );

    expect(found.teamPage).toBe("https://www.acme.test/about/our-team/");
    expect(found.staff).toEqual([
      {
        name: "Asha Rao",
        title: "Founder",
        photo: "https://www.acme.test/people/asha.jpg",
      },
      { name: "Vikram Shah", title: null, photo: null },
      { name: "Meera Iyer", title: null, photo: null },
    ]);
    expect(extract(`<a href="/contact">Contact</a>`, base)).toMatchObject({
      teamPage: null,
      staff: [],
    });
  });

  it("tells a page a browser has yet to draw from one with words on it", () => {
    // What a script-built site sends: a full head, scripts, and nothing to read.
    const shell = `<html><head><title>Acme Anvils and much else besides</title>
      <meta name="description" content="Anvils"><style>${"body{margin:0}".repeat(40)}</style></head>
      <body><div id="root"></div><noscript>${"Please turn on JavaScript. ".repeat(20)}</noscript>
      <template>${"Held back. ".repeat(40)}</template>
      <script>self.__next_f.push(${JSON.stringify("x".repeat(2000))})</script></body></html>`;
    expect(extract(shell, base)).toMatchObject({ blank: true, description: "Anvils" });
    expect(
      extract(`<body><h1>Acme</h1><p>${"We make anvils. ".repeat(20)}</p></body>`, base)
        .blank,
    ).toBe(false);
  });
});

describe("extractPeople", () => {
  // The shape of the page that prompted this: site links first, then the team.
  const at = "https://www.acme.test/team";
  // Site links and a banner first, then one card per person: with a picture, with
  // initials, and with a picture that only loads when it scrolls into view.
  const teamPage = `
    <header><h2>Acme Design</h2><img src="/logo.png"></header>
    <footer>
      <h3>THE STUDIO</h3><ul><li><a href="/about">About Us</a></li></ul>
      <h3>FINE PRINT</h3><ul><li><a href="/privacy">Privacy Policy</a></li></ul>
    </footer>
    <section>
      <img src="/team-banner.jpg">
      <h2>Our Team</h2><p>The people behind it all</p>
      <div>
        <div><img src="/people/asha.jpg" width="320" height="320"><div><h3 class="x">Mrs. Asha Rao</h3><p>Founder</p>
          <a href="https://linkedin.test/in/asha"><img src="/icons/in.png" width="16" height="16"></a></div></div>
        <div><div>VS</div><div><h3>Mr Vikram <span>Shah</span></h3><p>Design <b>Lead</b> &amp; Partner</p></div></div>
        <div><figure><picture><source srcset="/people/meera.avif">
          <img src="data:image/gif;base64,R0lGOD" data-src="//cdn.acme.test/people/meera.webp"></picture></figure>
          <div><h3>Ms. Meera D'Souza</h3><p>Part of the team</p></div></div>
      </div>
    </section>`;

  it("reads names in headings with the role under each, and the picture in the same card", () => {
    expect(extractPeople(teamPage, at)).toEqual([
      {
        name: "Asha Rao",
        title: "Founder",
        photo: "https://www.acme.test/people/asha.jpg",
      },
      { name: "Vikram Shah", title: "Design Lead & Partner", photo: null },
      {
        name: "Meera D'Souza",
        title: "Part of the team",
        photo: "https://cdn.acme.test/people/meera.webp",
      },
    ]);
  });

  it.each([
    [
      "sits over two names",
      `<div><img src="/both.jpg"><h3>Asha Rao</h3><p>Founder</p><h3>Vikram Shah</h3><p>Director</p></div>`,
    ],
    [
      "is elsewhere on the page",
      `<img src="/banner.jpg"><h2>Our Story</h2><p>Since 1990</p><h3>Asha Rao</h3><p>Founder</p>`,
    ],
    [
      "is far above the name",
      `<div><img src="/banner.jpg"><div><div><div><div><div><h3>Asha Rao</h3><p>Founder</p></div></div></div></div></div></div>`,
    ],
    [
      "cannot be stored",
      `<div><img src="/a.svg"><img src="javascript:alert(1)"><img src="/dot.png" width="1" height="1"><h3>Asha Rao</h3><p>Founder</p></div>`,
    ],
  ])("takes no picture that %s", (_label, html) => {
    for (const person of extractPeople(html, at)) {
      expect(person).toMatchObject({ photo: null });
    }
    expect(extractPeople(html, at)[0].name).toBe("Asha Rao");
  });

  it("takes the first picture in a card and reads a srcset", () => {
    expect(
      extractPeople(
        `<div><img srcset="/_next/image?url=%2Fasha.jpg&w=640&q=75 640w, /big.jpg 1280w"><img src="/second.png"><h3>Asha Rao</h3><p>Founder</p></div>`,
        at,
      ),
    ).toEqual([
      {
        name: "Asha Rao",
        title: "Founder",
        photo: "https://www.acme.test/_next/image?url=%2Fasha.jpg&w=640&q=75",
      },
    ]);
  });

  it("takes a lone founder, and nobody from headings without a position among them", () => {
    expect(
      extractPeople(
        `<h2>Our Story</h2><p>Since 1990</p><h4>Asha Rao</h4><span>Co-Founder</span>`,
        at,
      ),
    ).toEqual([{ name: "Asha Rao", title: "Co-Founder", photo: null }]);
    expect(
      extractPeople(
        `<h3>Priya Sharma</h3><p>The quality feels premium.</p>
         <h3>Ananya Roy</h3><p>It exceeded expectations.</p>`,
        at,
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
        at,
      ),
    ).toEqual([
      { name: "Asha Rao", title: "Managing Director", photo: null },
      { name: "Vikram Shah", title: null, photo: null },
    ]);
  });

  it("on a home page takes only the names under a heading that introduces the team", () => {
    // Cards for figures, services and customers share the people's heading level.
    const homePage = `
      <h1>Acme Anvils</h1>
      <h2>Our Vision</h2><h3>Combined Expertise</h3><p>30+</p>
      <h2>Services Offered</h2><h3>Registration Services</h3><p>Head office filings</p>
      <h2>What Our Clients Say</h2><h3>Priya Sharma</h3><p>Director, Elsewhere Ltd</p>
      <h2>Join Our Team</h2><h3>Senior Accountant</h3><p>Lead the audit desk</p>
      <h2>Our Team</h2><p>Led by two partners.</p>
      <div><div><h3>CA Asha Rao</h3><p>Partner</p></div><div><img src="/people/asha.jpg"></div></div>
      <div><h3>Vikram Shah</h3><p>Banking and advisory</p></div>
      <h2>Contact</h2><h3>Head Office</h3><p>Pune</p>`;

    expect(extractPeople(homePage, at, "section")).toEqual([
      {
        name: "Asha Rao",
        title: "Partner",
        photo: "https://www.acme.test/people/asha.jpg",
      },
      { name: "Vikram Shah", title: "Banking and advisory", photo: null },
    ]);
    // Read as a team page, the same markup offers its customer and its cards too.
    expect(extractPeople(homePage, at).map((person) => person.name)).toContain(
      "Priya Sharma",
    );
    expect(
      extractPeople(`<h1>Leadership</h1><h2>Asha Rao</h2><p>Anvils</p>`, at, "section"),
    ).toEqual([{ name: "Asha Rao", title: "Anvils", photo: null }]);
    expect(extractPeople(`<h1>Asha Rao</h1><p>Founder</p>`, at)).toEqual([]);
  });

  it("lists each person once, without honorifics, and stops at twelve", () => {
    expect(
      listPeople([
        { name: "Dr. Asha Rao", title: "Founder", photo: "https://acme.test/a.jpg" },
        { name: "asha rao", title: "Director", photo: null },
        { name: "Mr. ", title: null, photo: null },
        { name: "CA Vikram Shah", title: "Partner", photo: null },
        { name: "Ca Mau", title: null, photo: null },
      ]),
    ).toEqual([
      { name: "Asha Rao", title: "Founder", photo: "https://acme.test/a.jpg" },
      { name: "Vikram Shah", title: "Partner", photo: null },
      { name: "Ca Mau", title: null, photo: null },
    ]);
    expect(
      listPeople(
        Array.from({ length: 30 }, (_, index) => ({
          name: `Person ${index}`,
          title: null,
          photo: null,
        })),
      ),
    ).toHaveLength(12);
  });

  it("does not slow down on a hostile page", () => {
    const started = Date.now();
    extractPeople(
      `<h3>${"A ".repeat(100_000)}</h3>${"<div>".repeat(5_000)}${"<div><img src='/a.png'><h3>Aa Bb</h3><p>Founder</p></div>".repeat(20_000)}`,
      at,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

// A script-built home page as the outside reader hands it back.
const DRAWN_HOME = `Title: Acme Anvils

URL Source: https://acme.test/

Markdown Content:
![Image 1: Acme Logo](https://acme.test/logo.png)

## Services Offered

### Registration Services

Head office filings

## Our Team

Led by two partners.

### CA Asha Rao

![Image 7: CA Asha Rao](https://acme.test/_next/image?url=%2Fasha.jpg&w=640&q=75)

**Partner**

### [Vikram Shah](https://acme.test/people/vikram)

${"He joined long ago. ".repeat(12)}

![Image 8](https://acme.test/unnamed.jpg)

#### Contact Us

*   [+91 20 5550 1234](tel:+91%2020%205550%201234)[not a number](tel:call-us)
*   [Write](mailto:someone@gmail.test) [Us](mailto:hello@acme.test?subject=Hi)
*   [Elsewhere](https://elsewhere.test/team) [Team](/about/our-team#top) [Contact](https://acme.test/contact-us "Reach us")
`;

describe("renderedPage", () => {
  const answer = (body: string, more: object = {}) => ({
    url: "https://r.jina.ai/https://acme.test/",
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: Buffer.from(body),
    truncated: false,
    ...more,
  });

  it("asks the reader for the address and returns the page under its heading lines", async () => {
    const seen: unknown[] = [];
    const page = await renderedPage(
      "https://acme.test/",
      async (url, options) => {
        seen.push(url, options.accept, options.timeoutMs, options.deadline);
        return answer(DRAWN_HOME);
      },
      1234,
    );

    expect(seen).toEqual(["https://r.jina.ai/https://acme.test/", "text/plain", 10_000, 1234]);
    expect(page).toMatch(/^\s*!\[Image 1: Acme Logo\]/);
    expect(page).not.toContain("URL Source");
  });

  it.each([
    ["is over its limit", async () => answer("Slow down", { status: 429 })],
    ["answers with more than can be kept", async () => answer(DRAWN_HOME, { truncated: true })],
    [
      "cannot be reached",
      async () => {
        throw new FetchError("timeout");
      },
    ],
  ])("returns nothing when the reader %s", async (_label, fetcher) => {
    expect(await renderedPage("https://acme.test/", fetcher, 0)).toBeNull();
  });
});

describe("readMarkdown", () => {
  const at = "https://acme.test/";

  it("reads the team, the contact links and the site's own pages from a drawn home page", () => {
    expect(readMarkdown(DRAWN_HOME, at, "section")).toEqual({
      phone: "+91 20 5550 1234",
      email: "hello@acme.test",
      contactPage: "https://acme.test/contact-us",
      teamPage: "https://acme.test/about/our-team",
      people: [
        {
          name: "Asha Rao",
          title: "Partner",
          photo: "https://acme.test/_next/image?url=%2Fasha.jpg&w=640&q=75",
        },
        // A biography is not a role, and a picture nobody is named on is nobody's.
        { name: "Vikram Shah", title: null, photo: null },
      ],
    });
  });

  it("reads a drawn team page by who holds a position, as the HTML reader does", () => {
    expect(
      readMarkdown(
        `# Acme\n\n### Asha Rao\nFounder\n### Zoya Khan\nDesigner\n#### Head Office\nPune\n## Kabir Mehta\nA customer`,
        at,
        "page",
      ).people,
    ).toEqual([
      { name: "Asha Rao", title: "Founder", photo: null },
      { name: "Zoya Khan", title: "Designer", photo: null },
    ]);
  });

  it("takes nothing from a page with nobody on it, and no picture that cannot be stored", () => {
    expect(readMarkdown("Just words.\n\n## Our Story\n\nSince 1990", at, "section")).toEqual({
      phone: null,
      email: null,
      contactPage: null,
      teamPage: null,
      people: [],
    });
    expect(
      readMarkdown(
        `## Our Team\n### Asha Rao\n![Asha Rao](javascript:void)![Asha Rao](/asha.svg)\nFounder`,
        at,
        "section",
      ).people,
    ).toEqual([{ name: "Asha Rao", title: "Founder", photo: null }]);
  });

  it("does not slow down on a hostile page", () => {
    const started = Date.now();
    readMarkdown(
      [
        "#".repeat(100_000),
        // As many full-length lines of unclosed links as the size cap lets through.
        ...Array.from({ length: 80 }, () => "[".repeat(2_000)),
        ...Array.from({ length: 80 }, () => "![a](".repeat(400)),
        ...Array.from({ length: 80 }, () => "[a](b".repeat(400)),
        ...Array.from({ length: 80 }, () => `${"](".repeat(999)})`),
        "## Our Team",
        ..."### Aa Bb\nFounder\n![Aa Bb](/a.png)\n".repeat(20_000).split("\n"),
      ].join("\n"),
      at,
      "section",
    );
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
        rendered: false,
      },
    });
  });

  describe("when the home page arrives empty", () => {
    const READER = "https://r.jina.ai/";
    const drawn = (body: string) => page(body, "text/plain; charset=utf-8");
    const shell = page(
      `<meta name="description" content="Anvils"><div id="root"></div><script src="/app.js"></script>`,
    );
    const asked = (pages: Parameters<typeof site>[0]) => {
      const seen: string[] = [];
      const answers = site(pages);
      const fetcher: Fetcher = (url, options) => {
        seen.push(url);
        return answers(url, options);
      };
      return { seen, fetcher };
    };

    it.each([
      [
        "with its pictures",
        "",
        "https://acme.test/_next/image?url=%2Fasha.jpg&w=640&q=75",
      ],
      ["without a picture the site's rules close off", "User-agent: *\nDisallow: /_next/", null],
    ])("reads the page as the outside reader draws it, %s", async (_label, rules, photo) => {
      const { seen, fetcher } = asked({
        "https://acme.test/": shell,
        [`${READER}https://acme.test/`]: drawn(DRAWN_HOME),
        "https://acme.test/robots.txt": page(rules, "text/plain"),
      });
      const result = await readWebsite("https://acme.test", fetcher, { render: true });

      expect(result).toMatchObject({
        ok: true,
        reading: {
          fields: {
            website: "https://acme.test",
            description: "Anvils",
            phone: "+91 20 5550 1234",
            email: "hello@acme.test",
          },
          rendered: true,
          people: [
            { name: "Asha Rao", title: "Partner", photo },
            { name: "Vikram Shah", title: null, photo: null },
          ],
        },
      });
      expect(seen.filter((url) => url.startsWith(READER))).toEqual([
        `${READER}https://acme.test/`,
      ]);
    });

    it("has a script-built team page drawn too, and lets it speak first", async () => {
      const { seen, fetcher } = asked({
        "https://acme.test/": shell,
        [`${READER}https://acme.test/`]: drawn(DRAWN_HOME),
        "https://acme.test/about/our-team": shell,
        [`${READER}https://acme.test/about/our-team`]: drawn(
          `# Who We Are\n\n### Zoya Khan\n\nHead of Design\n\n### Asha Rao\n\nManaging Partner`,
        ),
        "https://acme.test/contact-us": shell,
      });
      const result = await readWebsite("https://acme.test", fetcher, { render: true });

      expect(result.ok && result.reading.people).toEqual([
        { name: "Zoya Khan", title: "Head of Design", photo: null },
        { name: "Asha Rao", title: "Managing Partner", photo: null },
        { name: "Vikram Shah", title: null, photo: null },
      ]);
      // The contact page is fetched for the location, and never sent to be drawn.
      expect(seen).toContain("https://acme.test/contact-us");
      expect(seen.filter((url) => url.startsWith(READER))).toEqual([
        `${READER}https://acme.test/`,
        `${READER}https://acme.test/about/our-team`,
      ]);
    });

    it.each([
      ["is over its limit", { status: 429 }],
      ["answers with more than can be kept", { status: 200, truncated: true }],
    ])("keeps what the site itself said when the reader %s", async (_label, answer) => {
      const { fetcher } = asked({
        "https://acme.test/": shell,
        [`${READER}https://acme.test/`]: { ...drawn(DRAWN_HOME), ...answer },
      });

      expect(await readWebsite("https://acme.test", fetcher, { render: true })).toMatchObject({
        ok: true,
        reading: {
          fields: { website: "https://acme.test", description: "Anvils" },
          people: [],
          rendered: false,
        },
      });
    });

    it("keeps what the site itself said when the reader cannot be reached", async () => {
      const answers = site({ "https://acme.test/": shell });
      const result = await readWebsite(
        "https://acme.test",
        async (url, options) => {
          if (url.startsWith(READER)) throw new FetchError("unreachable");
          return answers(url, options);
        },
        { render: true },
      );

      expect(result).toMatchObject({
        ok: true,
        reading: { fields: { description: "Anvils" }, people: [], rendered: false },
      });
    });

    it("sends no address to the outside reader unless told it may", async () => {
      const { seen, fetcher } = asked({
        "https://acme.test/": shell,
        [`${READER}https://acme.test/`]: drawn(DRAWN_HOME),
      });

      expect(await readWebsite("https://acme.test", fetcher)).toMatchObject({
        ok: true,
        reading: { people: [], rendered: false },
      });
      expect(seen.some((url) => url.startsWith(READER))).toBe(false);
    });
  });

  it("reads a home page with words on it by itself, team section included", async () => {
    const seen: string[] = [];
    const answers = site({
      "https://acme.test/": page(
        `<h1>Acme Anvils</h1><p>${"We make anvils. ".repeat(20)}</p>
         <h2>Our Customers</h2><h3>Priya Sharma</h3><p>Director, Elsewhere Ltd</p>
         <h2>Meet the Team</h2><h3>Asha Rao</h3><p>Partner</p>`,
      ),
    });
    const result = await readWebsite(
      "https://acme.test",
      (url, options) => {
        seen.push(url);
        return answers(url, options);
      },
      { render: true },
    );

    expect(result).toMatchObject({
      ok: true,
      reading: {
        people: [{ name: "Asha Rao", title: "Partner", photo: null }],
        rendered: false,
      },
    });
    expect(seen.some((url) => url.startsWith("https://r.jina.ai/"))).toBe(false);
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
          `<div><img src="/people/asha.jpg"><h3>Mrs. Asha Rao</h3><p>Founder</p></div>
           <div><img src="/private/vikram.jpg"><h3>Vikram Shah</h3><p>Design Lead</p></div>
           <div><img src="https://cdn.test/private/zoya.jpg"><h3>Zoya Khan</h3><p>Designer</p></div>`,
        ),
        // The site's own rules cover its own pictures; another host's are not its to forbid.
        "https://acme.test/robots.txt": page(
          "User-agent: *\nDisallow: /private/",
          "text/plain",
        ),
      }),
    );

    expect(result.ok && result.reading.people).toEqual([
      {
        name: "Asha Rao",
        title: "Founder",
        photo: "https://acme.test/people/asha.jpg",
      },
      { name: "Vikram Shah", title: "Design Lead", photo: null },
      {
        name: "Zoya Khan",
        title: "Designer",
        photo: "https://cdn.test/private/zoya.jpg",
      },
      { name: "Kabir Mehta", title: null, photo: null },
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
