import { Parser } from "htmlparser2";
import { emailAddress, phoneNumber } from "@/lib/form";

export type Extracted = {
  description: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  // Profiles the site says are its own (JSON-LD sameAs).
  links: string[];
  // Candidate logo addresses, best first.
  icons: string[];
  // The site's own contact page, when this page links to one.
  contactPage: string | null;
  // The page listing the company's people, when this page links to one.
  teamPage: string | null;
  // People the company names as its own (JSON-LD founder, employee, member).
  staff: { name: string; title: string | null }[];
};

const MAX_JSON_LD = 200_000;
const MAX_LINKS = 10;
const MAX_CONTACT_LINKS = 20;
const ORGANIZATION_TYPE = /(Organization|Business|Corporation|ProfessionalService)$/;
const CONTACT_PATH = /\/contact[^/]*\/?$/i;
const TEAM_PATH =
  /\/(our-)?(team|people|leadership|management|founders?)[^/]*\/?$/i;
const MAX_STAFF = 50;

// Page text is someone else's: one line, no control characters, no longer than the field allows.
export function clean(value: unknown, max: number) {
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

function decoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Held to the rules of the company form, so a value read here can always be saved again.
function phone(value: unknown) {
  const parsed = phoneNumber.safeParse(
    clean(value, 60)?.replace(/^tel:/i, ""),
  );
  return parsed.success ? parsed.data : null;
}

function email(value: unknown) {
  const parsed = emailAddress.safeParse(
    clean(value, 400)
      ?.replace(/^mailto:/i, "")
      .split("?")[0],
  );
  return parsed.success ? parsed.data : null;
}

const firstFound = (values: (string | null)[]) =>
  values.find((value) => value !== null) ?? null;

export function extract(html: string, baseUrl: string): Extracted {
  const site = new URL(baseUrl).hostname.toLowerCase();
  const meta = new Map<string, string>();
  const icons: { url: string; rank: number }[] = [];
  const phoneLinks: string[] = [];
  const emailLinks: string[] = [];
  const contactPages: string[] = [];
  const teamPages: string[] = [];
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
        } else if (name === "a" && attributes.href) {
          const href = attributes.href.trim();
          if (/^tel:/i.test(href)) {
            if (phoneLinks.length < MAX_CONTACT_LINKS) phoneLinks.push(decoded(href));
          } else if (/^mailto:/i.test(href)) {
            if (emailLinks.length < MAX_CONTACT_LINKS) emailLinks.push(decoded(href));
          } else if (contactPages.length === 0 || teamPages.length === 0) {
            const url = webUrl(href, baseUrl);
            const target = url && new URL(url);
            if (!target || target.hostname.toLowerCase() !== site) return;
            target.hash = "";
            if (CONTACT_PATH.test(target.pathname)) {
              if (contactPages.length === 0) contactPages.push(target.href);
            } else if (TEAM_PATH.test(target.pathname) && teamPages.length === 0) {
              teamPages.push(target.href);
            }
          }
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
  // What the page states about the company outranks a link that may be anyone's.
  const stated = [found, ...list(found?.contactPoint)].filter(isNode);
  const linked = emailLinks.map(email).filter((address) => address !== null);
  const own = site.replace(/^www\./, "");
  const atOwnDomain = (address: string) => {
    const domain = address.slice(address.indexOf("@") + 1);
    return domain === own || own.endsWith(`.${domain}`) || domain.endsWith(`.${own}`);
  };

  return {
    description:
      clean(meta.get("description"), 2000) ??
      clean(meta.get("og:description"), 2000) ??
      clean(found?.description, 2000),
    phone:
      firstFound(stated.map((node) => phone(node.telephone))) ??
      firstFound(phoneLinks.map(phone)),
    email:
      firstFound(stated.map((node) => email(node.email))) ??
      linked.find(atOwnDomain) ??
      linked[0] ??
      null,
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
    contactPage: contactPages[0] ?? null,
    teamPage: teamPages[0] ?? null,
    staff: [found?.founder, found?.employee, found?.member]
      .flatMap(list)
      .filter(isNode)
      .slice(0, MAX_STAFF)
      .flatMap((person) => {
        const name = clean(person.name, 60);
        return name ? [{ name, title: clean(person.jobTitle, 150) }] : [];
      }),
  };
}
