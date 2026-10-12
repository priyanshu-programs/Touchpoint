import { Parser } from "htmlparser2";
import { emailAddress, phoneNumber } from "@/lib/form";
import { countryName } from "./guess";

export type Extracted = {
  description: string | null;
  // How the page describes the company (title, descriptions, keywords, JSON-LD type):
  // what an industry is guessed from.
  about: string | null;
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
  staff: { name: string; title: string | null; photo: string | null }[];
  // The page arrived with next to no text of its own: a browser draws it from scripts.
  blank: boolean;
};

const MAX_JSON_LD = 200_000;
const MAX_LINKS = 10;
const MAX_CONTACT_LINKS = 20;
const ORGANIZATION_TYPE = /(Organization|Business|Corporation|ProfessionalService)$/;
export const CONTACT_PATH = /\/contact[^/]*\/?$/i;
export const TEAM_PATH =
  /\/(our-)?(team|people|leadership|management|founders?)[^/]*\/?$/i;
const MAX_STAFF = 50;
// Fewer characters than this is a loading message, not a page.
const MIN_PAGE_TEXT = 200;
// Text in these is not what a visitor reads.
const UNREAD = new Set(["script", "style", "template", "noscript", "title"]);
const MAX_SNIPPET = 300;
// The parts of an address a page can mark up in its tags (schema.org microdata).
const ADDRESS_PARTS = ["addressLocality", "addressRegion", "addressCountry"] as const;
type AddressPart = (typeof ADDRESS_PARTS)[number];
const isAddressPart = (value: string): value is AddressPart =>
  (ADDRESS_PARTS as readonly string[]).includes(value);

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

export function webUrl(value: unknown, base: string) {
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

const MAX_URL = 2000;

// A picture that can be stored: a web address, and not an SVG, which can carry script.
export function photoUrl(value: unknown, base: string) {
  const url = webUrl(value, base);
  if (!url || url.length > MAX_URL) return null;
  return new URL(url).pathname.toLowerCase().endsWith(".svg") ? null : url;
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

export function decoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Held to the rules of the company form, so a value read here can always be saved again.
export function phone(value: unknown) {
  const parsed = phoneNumber.safeParse(
    clean(value, 60)?.replace(/^tel:/i, ""),
  );
  return parsed.success ? parsed.data : null;
}

export function email(value: unknown) {
  const parsed = emailAddress.safeParse(
    clean(value, 400)
      ?.replace(/^mailto:/i, "")
      .split("?")[0],
  );
  return parsed.success ? parsed.data : null;
}

// Of the addresses a page links to, the one at the company's own domain, else the first.
export function ownEmail(addresses: string[], host: string) {
  const own = host.toLowerCase().replace(/^www\./, "");
  const atOwnDomain = (address: string) => {
    const domain = address.slice(address.indexOf("@") + 1);
    return domain === own || own.endsWith(`.${domain}`) || domain.endsWith(`.${own}`);
  };
  return addresses.find(atOwnDomain) ?? addresses[0] ?? null;
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
  let unread = 0;
  let pageText = 0;
  let title: string | null = null;
  let inTitle = false;
  let depth = 0;
  // Where the page's first marked-up postal address opened, while inside it.
  let addressAt: number | null = null;
  let addressRead = false;
  // The part of it whose words are being read.
  let part: { name: AddressPart; at: number; text: string } | null = null;
  const marked: Partial<Record<AddressPart, string>> = {};

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        depth += 1;
        if (UNREAD.has(name)) unread += 1;
        if (name === "title" && title === null) {
          title = "";
          inTitle = true;
        }
        const itemprop = attributes.itemprop?.trim() ?? "";
        if (addressAt === null) {
          if (!addressRead && /PostalAddress\/?$/.test(attributes.itemtype?.trim() ?? "")) {
            addressAt = depth;
          }
        } else if (!part && isAddressPart(itemprop) && !(itemprop in marked)) {
          if (attributes.content !== undefined) marked[itemprop] = attributes.content;
          else part = { name: itemprop, at: depth, text: "" };
        }
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
        if (inTitle && title !== null && title.length < MAX_SNIPPET) title += text;
        if (part && part.text.length < MAX_SNIPPET) part.text += text;
        if (unread === 0 && pageText < MIN_PAGE_TEXT) {
          pageText += text.replace(/\s+/g, "").length;
        }
      },
      onclosetag(name) {
        if (part && depth === part.at) {
          marked[part.name] = part.text;
          part = null;
        }
        if (depth === addressAt) {
          addressAt = null;
          addressRead = true;
        }
        depth -= 1;
        if (name === "title") inTitle = false;
        if (UNREAD.has(name)) unread = Math.max(0, unread - 1);
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
  const types = list(found?.["@type"])
    .filter((type) => typeof type === "string")
    // AccountingService reads as two words.
    .map((type) => type.replace(/([a-z])([A-Z])/g, "$1 $2"));

  return {
    description:
      clean(meta.get("description"), 2000) ??
      clean(meta.get("og:description"), 2000) ??
      clean(found?.description, 2000),
    about: clean(
      [
        title,
        meta.get("description"),
        meta.get("og:description"),
        meta.get("keywords"),
        found?.description,
        ...types,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.slice(0, 2000))
        .join(" "),
      5000,
    ),
    phone:
      firstFound(stated.map((node) => phone(node.telephone))) ??
      firstFound(phoneLinks.map(phone)),
    email:
      firstFound(stated.map((node) => email(node.email))) ??
      ownEmail(linked, site),
    // What the company states in JSON-LD outranks an address marked up in the page.
    city:
      clean(place(address?.addressLocality), 100) ??
      clean(marked.addressLocality, 100),
    region:
      clean(place(address?.addressRegion), 100) ??
      clean(marked.addressRegion, 100),
    country: countryName(
      clean(place(address?.addressCountry), 100) ??
        clean(marked.addressCountry, 100),
    ),
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
        const image = list(person.image)[0];
        return name
          ? [
              {
                name,
                title: clean(person.jobTitle, 150),
                photo: photoUrl(isNode(image) ? image.url : image, baseUrl),
              },
            ]
          : [];
      }),
    blank: pageText < MIN_PAGE_TEXT,
  };
}
