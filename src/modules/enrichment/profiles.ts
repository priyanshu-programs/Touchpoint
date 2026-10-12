import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contactLinks,
  profileSearches,
  type ProfileCandidate,
} from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/safe-fetch";
import { getContact } from "@/modules/contacts/queries";
import { addContactLink } from "@/modules/contacts/service";
import { searchProfiles, type ProfileSearch } from "./profile-search";

export { PROFILE_KINDS } from "@/db/schema";

// The free allowance is 1,000 searches a month; a failed search may have used one too.
export const SEARCHES_PER_HOUR = 20;
export const SEARCHES_PER_30_DAYS = 900;

type Search = (person: {
  name: string;
  company: string | null;
}) => Promise<ProfileSearch>;

const key = env.TAVILY_API_KEY;
const tavily: Search | null = key
  ? (person) => searchProfiles(person, key, safeFetch)
  : null;

export const profileSearchEnabled = () => tavily !== null;

export type ProfileSearchRequest =
  | { ok: true; found: number }
  | {
      ok: false;
      reason:
        | "disabled"
        | "not_found"
        | "rate_limited"
        | "refused_key"
        | "used_up"
        | "unavailable";
    };

// Tests pass their own search, since the real one needs a key and the internet.
export async function requestProfileSearch(
  ownerId: string,
  contactId: string,
  search: Search | null = tavily,
): Promise<ProfileSearchRequest> {
  if (!search) return { ok: false, reason: "disabled" };
  const contact = await getContact(ownerId, contactId);
  if (!contact) return { ok: false, reason: "not_found" };

  const [recent] = await db
    .select({
      last30Days: sql<number>`count(*)::int`,
      lastHour: sql<number>`(count(*) filter (
        where ${profileSearches.createdAt} > now() - interval '1 hour'
      ))::int`,
      thisPersonLastMinute: sql<number>`(count(*) filter (
        where ${profileSearches.contactId} = ${contactId}
          and ${profileSearches.createdAt} > now() - interval '1 minute'
      ))::int`,
    })
    .from(profileSearches)
    .where(
      and(
        eq(profileSearches.ownerId, ownerId),
        sql`${profileSearches.createdAt} > now() - interval '30 days'`,
      ),
    );
  if (
    recent.last30Days >= SEARCHES_PER_30_DAYS ||
    recent.lastHour >= SEARCHES_PER_HOUR ||
    recent.thisPersonLastMinute > 0
  ) {
    return { ok: false, reason: "rate_limited" };
  }

  const result = await search({
    name: contact.fullName,
    company: contact.companies[0]?.name ?? null,
  });
  await db.insert(profileSearches).values({
    ownerId,
    contactId,
    status: result.ok ? "done" : "failed",
    results: result.ok ? result.candidates : [],
  });
  if (result.ok) return { ok: true, found: result.candidates.length };

  logger.warn("profile_search.failed", { status: result.status });
  if (result.status === 401) return { ok: false, reason: "refused_key" };
  if (result.status === 429 || result.status === 432 || result.status === 433) {
    return { ok: false, reason: "used_up" };
  }
  return { ok: false, reason: "unavailable" };
}

// What the latest search still offers: nothing of a kind the person already has a link for.
export async function profileSuggestions(
  ownerId: string,
  contactId: string,
): Promise<ProfileCandidate[]> {
  const [[latest], links] = await Promise.all([
    db
      .select({ results: profileSearches.results })
      .from(profileSearches)
      .where(
        and(
          eq(profileSearches.ownerId, ownerId),
          eq(profileSearches.contactId, contactId),
        ),
      )
      .orderBy(desc(profileSearches.createdAt))
      .limit(1),
    db
      .select({ kind: contactLinks.kind })
      .from(contactLinks)
      .where(
        and(
          eq(contactLinks.ownerId, ownerId),
          eq(contactLinks.contactId, contactId),
        ),
      ),
  ]);
  if (!latest) return [];
  const taken = new Set(links.map(({ kind }) => kind));
  return latest.results.filter(({ kind }) => !taken.has(kind));
}

// Adds a link only if the search offered it for this person, so the form can add no other.
export async function acceptProfile(
  ownerId: string,
  contactId: string,
  url: string,
) {
  const offered = (await profileSuggestions(ownerId, contactId)).find(
    (candidate) => candidate.url === url,
  );
  if (!offered) return false;
  return addContactLink(ownerId, contactId, {
    kind: offered.kind,
    url: offered.url,
  });
}

// The searches stay, emptied, because they still count against the allowance.
export async function dismissProfiles(ownerId: string, contactId: string) {
  await db
    .update(profileSearches)
    .set({ results: [] })
    .where(
      and(
        eq(profileSearches.ownerId, ownerId),
        eq(profileSearches.contactId, contactId),
      ),
    );
}
