import { FetchError, safeFetch, type Fetcher, type FetchResult } from "@/lib/safe-fetch";
import { extract } from "./extract";
import { imageType, MAX_LOGO_BYTES } from "./image";
import { robotsAllows } from "./robots";

export const ENRICHABLE_FIELDS = [
  "website",
  "description",
  "city",
  "region",
  "country",
] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

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
};
export type ReadResult =
  | { ok: true; reading: Reading }
  | { ok: false; error: ReadError };

const BUDGET_MS = 10_000;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 100_000;
const MAX_LOGO_TRIES = 3;

const ok = (status: number) => status >= 200 && status < 300;
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

// Reads a company's home page once and returns what the page says about itself.
export async function readWebsite(
  start: string,
  fetcher: Fetcher = safeFetch,
): Promise<ReadResult> {
  const deadline = Date.now() + BUDGET_MS;
  const fail = (error: ReadError): ReadResult => ({ ok: false, error });

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
    if (!/^\s*(text\/html|application\/xhtml\+xml)\b/i.test(page.contentType)) {
      return fail("not_html");
    }
    const landed = new URL(page.url);
    if (!sameSite(home.hostname, landed.hostname)) return fail("moved");

    const found = extract(text(page), landed.href);
    const fields: Reading["fields"] = { website: landed.origin };
    for (const field of ["description", "city", "region", "country"] as const) {
      const value = found[field];
      if (value) fields[field] = value;
    }

    let logo: Reading["logo"] = null;
    for (const icon of found.icons.slice(0, MAX_LOGO_TRIES)) {
      const url = new URL(icon);
      if (url.origin === landed.origin && !allowed(url)) continue;
      try {
        const image = await fetcher(icon, { maxBytes: MAX_LOGO_BYTES, deadline });
        const contentType = imageType(image.body);
        if (ok(image.status) && !image.truncated && contentType) {
          logo = { contentType, bytes: image.body, sourceUrl: image.url };
          break;
        }
      } catch (error) {
        // A missing logo is not a failed read.
        if (!(error instanceof FetchError)) throw error;
      }
    }

    return { ok: true, reading: { fields, links: found.links, logo } };
  } catch (error) {
    if (error instanceof FetchError) return fail(error.code);
    throw error;
  }
}
