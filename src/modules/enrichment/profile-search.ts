import { z } from "zod";
import type { ProfileCandidate } from "@/db/schema";
import { FetchError, type Fetcher } from "@/lib/safe-fetch";
import { clean } from "./website/extract";

const ENDPOINT = "https://api.tavily.com/search";
const SITES = ["linkedin.com", "x.com", "twitter.com", "github.com"];
const BUDGET_MS = 8_000;
const MAX_ANSWER_BYTES = 200_000;
const MAX_RESULTS = 15;
const PER_KIND = 3;
const MAX_TITLE = 120;

// First path segments on these sites that are pages of the site, not somebody's profile.
const X_PAGES = new Set([
  "home",
  "search",
  "i",
  "explore",
  "intent",
  "share",
  "hashtag",
  "login",
  "settings",
]);
const GITHUB_PAGES = new Set([
  "orgs",
  "topics",
  "features",
  "about",
  "sponsors",
  "marketplace",
  "search",
  "login",
  "pricing",
  "collections",
  "trending",
  "apps",
  "enterprise",
]);

// A person's profile on one of the three sites, in the one form it is kept in, or null
// for anything else there: a company page, a post, a repository.
export function classifyProfile(
  address: string,
): Pick<ProfileCandidate, "kind" | "url"> | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const [section, slug] = parts;
    if (section !== "in" || !slug || !/^[A-Za-z0-9%_.-]{2,100}$/.test(slug)) {
      return null;
    }
    return { kind: "linkedin", url: `https://www.linkedin.com/in/${slug}` };
  }
  if (parts.length !== 1) return null;
  const [name] = parts;
  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(name) || X_PAGES.has(name.toLowerCase())) {
      return null;
    }
    return { kind: "x", url: `https://x.com/${name}` };
  }
  if (host === "github.com") {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(name) ||
      GITHUB_PAGES.has(name.toLowerCase())
    ) {
      return null;
    }
    return { kind: "github", url: `https://github.com/${name}` };
  }
  return null;
}

const answer = z.object({
  results: z
    .array(z.object({ url: z.string(), title: z.string().nullish() }))
    .max(50),
});

export type ProfileSearch =
  | { ok: true; candidates: ProfileCandidate[] }
  // The service's status, or null when it could not be reached.
  | { ok: false; status: number | null };

export async function searchProfiles(
  person: { name: string; company: string | null },
  key: string,
  fetcher: Fetcher,
): Promise<ProfileSearch> {
  const query = [`"${person.name.replaceAll('"', " ")}"`, person.company]
    .filter(Boolean)
    .join(" ");
  let response;
  try {
    response = await fetcher(ENDPOINT, {
      maxBytes: MAX_ANSWER_BYTES,
      deadline: Date.now() + BUDGET_MS,
      timeoutMs: BUDGET_MS,
      accept: "application/json",
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: MAX_RESULTS,
        include_domains: SITES,
      }),
    });
  } catch (error) {
    if (error instanceof FetchError) return { ok: false, status: null };
    throw error;
  }
  if (response.status < 200 || response.status >= 300 || response.truncated) {
    return { ok: false, status: response.status };
  }

  let parsed;
  try {
    parsed = answer.safeParse(JSON.parse(response.body.toString("utf8")));
  } catch {
    return { ok: false, status: response.status };
  }
  if (!parsed.success) return { ok: false, status: response.status };

  const candidates: ProfileCandidate[] = [];
  for (const result of parsed.data.results) {
    const profile = classifyProfile(result.url);
    if (!profile) continue;
    // Addresses on these sites differ only by case when they are the same profile.
    const same = (other: ProfileCandidate) =>
      other.url.toLowerCase() === profile.url.toLowerCase();
    if (candidates.some(same)) continue;
    if (candidates.filter(({ kind }) => kind === profile.kind).length >= PER_KIND) {
      continue;
    }
    candidates.push({ ...profile, title: clean(result.title, MAX_TITLE) });
  }
  return { ok: true, candidates };
}
