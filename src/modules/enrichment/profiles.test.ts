import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { profileSearches, type ProfileCandidate } from "@/db/schema";
import { getContact } from "@/modules/contacts/queries";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact, deleteContact } from "@/modules/contacts/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import type { ProfileSearch } from "./profile-search";
import {
  acceptProfile,
  dismissProfiles,
  profileSuggestions,
  requestProfileSearch,
  SEARCHES_PER_HOUR,
} from "./profiles";

const LINKEDIN: ProfileCandidate = {
  kind: "linkedin",
  url: "https://www.linkedin.com/in/asha-rao",
  title: "Asha Rao - Acme Design",
};
const NAMESAKE: ProfileCandidate = {
  kind: "linkedin",
  url: "https://www.linkedin.com/in/asha-rao-2",
  title: "Asha Rao - Elsewhere",
};
const GITHUB: ProfileCandidate = {
  kind: "github",
  url: "https://github.com/asha-rao",
  title: null,
};

describe("profile links by name", () => {
  let ownerId: string;
  let asha: string;

  async function add(owner: string, firstName: string, organizationId = "") {
    const result = await createContact(
      owner,
      newContactInput.parse({
        firstName,
        lastName: "Rao",
        organizationId,
        jobTitle: "",
        department: "",
        phoneE164: "",
        city: "",
        region: "",
        country: "",
        timezone: "",
        preferredChannel: "",
        status: "active",
        relationshipType: "prospect",
        tags: "",
        email: "",
      }),
      { confirmSimilar: true },
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    const organization = await createOrganization(
      ownerId,
      organizationInput.parse({
        name: "Acme Design",
        domain: "",
        website: "",
        phone: "",
        email: "",
        industry: "",
        description: "",
        city: "",
        region: "",
        country: "",
        status: "prospect",
        tags: "",
      }),
    );
    if (!organization.ok) throw new Error("no organization");
    asha = await add(ownerId, "Asha", organization.id);
  });

  const finding =
    (candidates: ProfileCandidate[], asked: unknown[] = []) =>
    async (person: unknown): Promise<ProfileSearch> => {
      asked.push(person);
      return { ok: true, candidates };
    };
  const failing = (status: number | null) => async (): Promise<ProfileSearch> => ({
    ok: false,
    status,
  });
  // Moves what has been searched so far into the past.
  const age = (interval: string) =>
    db.execute(
      sql`update profile_searches set created_at = created_at - ${interval}::interval`,
    );

  it("does nothing without a search to use", async () => {
    expect(await requestProfileSearch(ownerId, asha, null)).toEqual({
      ok: false,
      reason: "disabled",
    });
    expect(await db.select().from(profileSearches)).toEqual([]);
  });

  it("searches by the person's name and first company, and keeps what was found", async () => {
    const asked: unknown[] = [];
    const result = await requestProfileSearch(
      ownerId,
      asha,
      finding([LINKEDIN, NAMESAKE, GITHUB], asked),
    );

    expect(result).toEqual({ ok: true, found: 3 });
    expect(asked).toEqual([{ name: "Asha Rao", company: "Acme Design" }]);
    expect(await profileSuggestions(ownerId, asha)).toEqual([LINKEDIN, NAMESAKE, GITHUB]);
    // Nothing is saved on the person until the owner adds it.
    expect((await getContact(ownerId, asha))?.links).toEqual([]);
  });

  it("will not search for another owner's contact, or show them what was found", async () => {
    const other = await createTestOwner("other@example.com");
    const asked: unknown[] = [];

    expect(await requestProfileSearch(other, asha, finding([LINKEDIN], asked))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(asked).toEqual([]);

    await requestProfileSearch(ownerId, asha, finding([LINKEDIN]));
    expect(await profileSuggestions(other, asha)).toEqual([]);
    expect(await acceptProfile(other, asha, LINKEDIN.url)).toBe(false);
    await dismissProfiles(other, asha);
    expect(await profileSuggestions(ownerId, asha)).toEqual([LINKEDIN]);
  });

  it("adds only an address the search offered, and then stops offering that kind", async () => {
    await requestProfileSearch(ownerId, asha, finding([LINKEDIN, NAMESAKE, GITHUB]));

    expect(await acceptProfile(ownerId, asha, "https://evil.test/")).toBe(false);
    expect(await acceptProfile(ownerId, asha, LINKEDIN.url)).toBe(true);

    expect((await getContact(ownerId, asha))?.links).toMatchObject([
      { kind: "linkedin", url: LINKEDIN.url },
    ]);
    expect(await profileSuggestions(ownerId, asha)).toEqual([GITHUB]);
    // The namesake went with the kind, so it cannot be added as a second LinkedIn.
    expect(await acceptProfile(ownerId, asha, NAMESAKE.url)).toBe(false);
  });

  it("will not add to one person what was found for another", async () => {
    const ravi = await add(ownerId, "Ravi");
    await requestProfileSearch(ownerId, asha, finding([LINKEDIN]));

    expect(await acceptProfile(ownerId, ravi, LINKEDIN.url)).toBe(false);
  });

  it("shows the latest search, and nothing once it is dismissed", async () => {
    await requestProfileSearch(ownerId, asha, finding([LINKEDIN]));
    await age("2 minutes");
    await requestProfileSearch(ownerId, asha, finding([GITHUB]));
    expect(await profileSuggestions(ownerId, asha)).toEqual([GITHUB]);

    await dismissProfiles(ownerId, asha);
    expect(await profileSuggestions(ownerId, asha)).toEqual([]);
    // Dismissed searches still count.
    expect(await db.select().from(profileSearches)).toHaveLength(2);
  });

  it("waits a minute between searches for the same person", async () => {
    const ravi = await add(ownerId, "Ravi");
    await requestProfileSearch(ownerId, asha, finding([]));

    expect(await requestProfileSearch(ownerId, asha, finding([]))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await requestProfileSearch(ownerId, ravi, finding([]))).toEqual({
      ok: true,
      found: 0,
    });
    await age("61 seconds");
    expect((await requestProfileSearch(ownerId, asha, finding([]))).ok).toBe(true);
  });

  it("stops at the hourly limit, counting failed searches, and starts again later", async () => {
    await db.insert(profileSearches).values(
      Array.from({ length: SEARCHES_PER_HOUR }, (_, index) => ({
        ownerId,
        contactId: asha,
        status: index % 2 ? "done" : "failed",
        results: [],
      })),
    );
    await age("5 minutes");
    const asked: unknown[] = [];

    expect(await requestProfileSearch(ownerId, asha, finding([], asked))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(asked).toEqual([]);

    await age("1 hour");
    expect((await requestProfileSearch(ownerId, asha, finding([]))).ok).toBe(true);
  });

  it.each([
    [401, "refused_key"],
    [429, "used_up"],
    [432, "used_up"],
    [500, "unavailable"],
    [null, "unavailable"],
  ])("says why a search with status %s failed, and offers nothing", async (status, reason) => {
    expect(await requestProfileSearch(ownerId, asha, failing(status))).toEqual({
      ok: false,
      reason,
    });
    expect(await profileSuggestions(ownerId, asha)).toEqual([]);
    expect(await db.select().from(profileSearches)).toMatchObject([{ status: "failed" }]);
  });

  it("forgets the searches when the person is deleted", async () => {
    await requestProfileSearch(ownerId, asha, finding([LINKEDIN]));
    await deleteContact(ownerId, asha);

    expect(await db.select().from(profileSearches)).toEqual([]);
  });
});
