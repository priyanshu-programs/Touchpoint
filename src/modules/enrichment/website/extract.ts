import { Parser } from "htmlparser2";

export type Extracted = {
  description: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  // Profiles the site says are its own (JSON-LD sameAs).
  links: string[];
  // Candidate logo addresses, best first.
  icons: string[];
};

const MAX_JSON_LD = 200_000;
const MAX_LINKS = 10;
const ORGANIZATION_TYPE = /(Organization|Business|Corporation|ProfessionalService)$/;

// Page text is someone else's: one line, no control characters, no longer than the field allows.
function clean(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return text || null;
}

function webUrl(value: unknown, base: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

function organizationNode(data: unknown, depth = 0): Node | null {
  if (depth > 4) return null;
  for (const item of list(data)) {
    if (!isNode(item)) continue;
    const isOrganization = list(item["@type"]).some(
      (type) => typeof type === "string" && ORGANIZATION_TYPE.test(type),
    );
    if (isOrganization) return item;
    const nested = organizationNode(item["@graph"], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function place(value: unknown) {
  return isNode(value) ? value.name : value;
}

export function extract(html: string, baseUrl: string): Extracted {
  const meta = new Map<string, string>();
  const icons: { url: string; rank: number }[] = [];
  let organization: Node | null = null;
  let jsonLd: string | null = null;

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === "meta") {
          const key = (attributes.name ?? attributes.property ?? "")
            .trim()
            .toLowerCase();
          if (key && attributes.content && !meta.has(key)) {
            meta.set(key, attributes.content);
          }
        } else if (name === "link") {
          const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
          const touch = rel.some((token) => token.startsWith("apple-touch-icon"));
          if (!touch && !rel.includes("icon")) return;
          const url = webUrl(attributes.href, baseUrl);
          const svg =
            attributes.type?.toLowerCase().includes("svg") ||
            (url !== null && new URL(url).pathname.toLowerCase().endsWith(".svg"));
          if (!url || svg) return;
          const size = Math.max(
            0,
            ...(attributes.sizes ?? "")
              .split(/\s+/)
              .map((entry) => Number.parseInt(entry, 10) || 0),
          );
          // Touch icons are drawn to stand alone as a tile, which is what a logo slot needs.
          icons.push({ url, rank: (touch ? 10_000 : 0) + Math.min(size, 9_999) });
        } else if (
          name === "script" &&
          attributes.type?.trim().toLowerCase() === "application/ld+json"
        ) {
          jsonLd = "";
        }
      },
      ontext(text) {
        if (jsonLd !== null && jsonLd.length < MAX_JSON_LD) jsonLd += text;
      },
      onclosetag(name) {
        if (name !== "script" || jsonLd === null) return;
        const source = jsonLd;
        jsonLd = null;
        if (organization || source.length >= MAX_JSON_LD) return;
        try {
          organization = organizationNode(JSON.parse(source));
        } catch {
          // Malformed JSON-LD is common; the page's other tags still count.
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);

  const found = organization as Node | null;
  const address = list(found?.address).find(isNode);
  const fallbackIcon = new URL("/favicon.ico", baseUrl).href;

  return {
    description:
      clean(meta.get("description"), 2000) ??
      clean(meta.get("og:description"), 2000) ??
      clean(found?.description, 2000),
    city: clean(place(address?.addressLocality), 100),
    region: clean(place(address?.addressRegion), 100),
    country: clean(place(address?.addressCountry), 100),
    links: [
      ...new Set(
        list(found?.sameAs)
          .map((link) => webUrl(link, baseUrl))
          .filter((link) => link !== null),
      ),
    ].slice(0, MAX_LINKS),
    icons: [
      ...new Set([
        ...icons.sort((a, b) => b.rank - a.rank).map((icon) => icon.url),
        fallbackIcon,
      ]),
    ],
  };
}
