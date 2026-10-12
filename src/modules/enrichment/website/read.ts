import { FetchError, safeFetch, type Fetcher, type FetchResult } from "@/lib/safe-fetch";
import { extract, type Extracted } from "./extract";
import {
  compressImage,
  imageType,
  MAX_LOGO_BYTES,
  MAX_LOGO_DOWNLOAD,
} from "./image";
import { extractPeople, listPeople, type Person, type Scope } from "./people";
import { readMarkdown, renderedPage } from "./render";
import { robotsAllows } from "./robots";

export const ENRICHABLE_FIELDS = [
  "website",
  "description",
  "city",
  "region",
  "country",
  "phone",
  "email",
] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];
// What a contact page is read for. Its description is about the page, not the company.
const CONTACT_FIELDS = ["phone", "email", "city", "region", "country"] as const;

export const READ_ERRORS = [
  "unreachable",
  "blocked",
  "timeout",
  "refused",
  "robots",
  "not_html",
  "moved",
] as const;
export type ReadError = (typeof READ_ERRORS)[number];

export type Reading = {
  fields: Partial<Record<EnrichableField, string>>;
  links: string[];
  logo: { contentType: string; bytes: Buffer; sourceUrl: string } | null;
  // People the site names as the company's own; offered to the owner, never added unasked.
  people: Person[];
  // Part of this came from the outside reader that draws script-built pages.
  rendered: boolean;
};
export type ReadResult =
  | { ok: true; reading: Reading }
  | { ok: false; error: ReadError };
export type ReadOptions = {
  // Whether a page that arrives empty may be sent to the outside reader to be drawn.
  render: boolean;
};

const BUDGET_MS = 10_000;
// Drawing a page takes seconds, so it is timed apart from the site's own answers.
const RENDER_BUDGET_MS = 20_000;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 100_000;
const MAX_LOGO_TRIES = 3;
// Shown at 40 pixels; this leaves room for sharp screens. Kept crisp: a logo is lines and letters.
const LOGO_FIT = { side: 192, quality: 90 };

const ok = (status: number) => status >= 200 && status < 300;
const html = (contentType: string) =>
  /^\s*(text\/html|application\/xhtml\+xml)\b/i.test(contentType);
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

// acme.com, www.acme.com and shop.acme.com are one site; a parked domain that
// forwards to a marketplace is not, and its details would be someone else's.
function sameSite(asked: string, landed: string) {
  const a = bare(asked);
  const b = bare(landed);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function text(page: FetchResult) {
  const charset = /charset=["']?([\w-]+)/i.exec(page.contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(page.body);
  } catch {
    return new TextDecoder().decode(page.body);
  }
}

// Reads a company's home page once, its contact page when the home page leaves
// contact details out and its team page when it links to one, and returns what
// the site says about itself. A page built by scripts is read as drawn.
export async function readWebsite(
  start: string,
  fetcher: Fetcher = safeFetch,
  { render }: ReadOptions = { render: false },
): Promise<ReadResult> {
  const started = Date.now();
  let deadline = started + BUDGET_MS;
  let rendered = false;
  const fail = (error: ReadError): ReadResult => ({ ok: false, error });
  const drawn = async (url: string, scope: Scope) => {
    if (!render) return null;
    const asked = Date.now();
    const markdown = await renderedPage(url, fetcher, started + RENDER_BUDGET_MS);
    // The wait was the reader's, not the site's.
    deadline += Date.now() - asked;
    if (markdown === null) return null;
    rendered = true;
    return readMarkdown(markdown, url, scope);
  };

  try {
    const home = new URL("/", start);
    const robots = await fetcher(new URL("/robots.txt", home).href, {
      maxBytes: MAX_ROBOTS_BYTES,
      deadline,
      accept: "text/plain",
    });
    // A server error says nothing about what is allowed, so nothing is assumed.
    if (robots.status >= 500) return fail("robots");
    const rules = ok(robots.status) ? robots.body.toString("utf8") : "";
    const allowed = (url: URL) => robotsAllows(rules, url.pathname + url.search);
    if (!allowed(home)) return fail("robots");

    const page = await fetcher(home.href, {
      maxBytes: MAX_PAGE_BYTES,
      deadline,
      accept: "text/html",
    });
    // Often a site's bot protection, sometimes a missing page: an answer either way.
    if (!ok(page.status)) return fail("refused");
    if (!html(page.contentType)) return fail("not_html");
    const landed = new URL(page.url);
    if (!sameSite(home.hostname, landed.hostname)) return fail("moved");

    const homeHtml = text(page);
    const found = extract(homeHtml, landed.href);
    const fields: Reading["fields"] = { website: landed.origin };
    const take = (
      from: Extracted,
      names: readonly Exclude<EnrichableField, "website">[],
    ) => {
      for (const field of names) {
        const value = from[field];
        if (value && !fields[field]) fields[field] = value;
      }
    };
    take(found, ["description", ...CONTACT_FIELDS]);

    let logo: Reading["logo"] = null;
    for (const icon of found.icons.slice(0, MAX_LOGO_TRIES)) {
      const url = new URL(icon);
      if (url.origin === landed.origin && !allowed(url)) continue;
      try {
        const image = await fetcher(icon, { maxBytes: MAX_LOGO_DOWNLOAD, deadline });
        if (!ok(image.status) || image.truncated) continue;
        const kept =
          (await compressImage(image.body, LOGO_FIT)) ??
          // An icon file cannot be re-encoded, so it is kept as it came.
          (imageType(image.body) === "image/x-icon"
            ? { contentType: "image/x-icon", bytes: image.body }
            : null);
        if (kept && kept.bytes.length <= MAX_LOGO_BYTES) {
          logo = { ...kept, sourceUrl: image.url };
          break;
        }
      } catch (error) {
        // A missing logo is not a failed read.
        if (!(error instanceof FetchError)) throw error;
      }
    }

    const homeDrawn = found.blank ? await drawn(landed.href, "section") : null;
    if (homeDrawn?.phone && !fields.phone) fields.phone = homeDrawn.phone;
    if (homeDrawn?.email && !fields.email) fields.email = homeDrawn.email;
    const contactPage = found.contactPage ?? homeDrawn?.contactPage;
    const teamPage = found.teamPage ?? homeDrawn?.teamPage;

    const contact = contactPage ? new URL(contactPage) : null;
    if (
      contact &&
      contact.href !== landed.href &&
      allowed(contact) &&
      CONTACT_FIELDS.some((field) => !fields[field])
    ) {
      try {
        const more = await fetcher(contact.href, {
          maxBytes: MAX_PAGE_BYTES,
          deadline,
          accept: "text/html",
        });
        if (
          ok(more.status) &&
          html(more.contentType) &&
          sameSite(landed.hostname, new URL(more.url).hostname)
        ) {
          take(extract(text(more), more.url), CONTACT_FIELDS);
        }
      } catch (error) {
        // The home page was read; a contact page that cannot be is only less to show.
        if (!(error instanceof FetchError)) throw error;
      }
    }

    const named: Person[] = [];
    const team = teamPage ? new URL(teamPage) : null;
    if (team && team.href !== landed.href && allowed(team)) {
      try {
        const more = await fetcher(team.href, {
          maxBytes: MAX_PAGE_BYTES,
          deadline,
          accept: "text/html",
        });
        if (
          ok(more.status) &&
          html(more.contentType) &&
          sameSite(landed.hostname, new URL(more.url).hostname)
        ) {
          const teamHtml = text(more);
          const listed = extractPeople(teamHtml, more.url);
          named.push(
            ...(listed.length === 0 && extract(teamHtml, more.url).blank
              ? ((await drawn(more.url, "page"))?.people ?? [])
              : listed),
          );
        }
      } catch (error) {
        // As with the contact page: the company's own details were read.
        if (!(error instanceof FetchError)) throw error;
      }
    }
    // A home page names its people among much else, so only its team section counts.
    named.push(
      ...(homeDrawn?.people ?? extractPeople(homeHtml, landed.href, "section")),
    );

    return {
      ok: true,
      reading: {
        fields,
        links: found.links,
        logo,
        people: listPeople([...named, ...found.staff]).map((person) => {
          const photo = person.photo ? new URL(person.photo) : null;
          // The site's own pictures are under its robots rules, like its pages.
          const refused =
            photo && photo.origin === landed.origin && !allowed(photo);
          return refused ? { ...person, photo: null } : person;
        }),
        rendered,
      },
    };
  } catch (error) {
    if (error instanceof FetchError) return fail(error.code);
    throw error;
  }
}
