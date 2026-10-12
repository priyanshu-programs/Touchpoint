import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { enrichmentRuns, fieldProvenance, jobs } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { countContacts, listContacts } from "@/modules/contacts/queries";
import { newContactInput } from "@/modules/contacts/schema";
import {
  addContactCompany,
  createContact,
  setContactArchived,
} from "@/modules/contacts/service";
import { runDueJobs } from "@/modules/jobs/service";
import { getOrganization, listOrganizations } from "@/modules/organizations/queries";
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  updateOrganization,
} from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  getLogo,
  latestRun,
  suggestedPeople,
  websiteFields,
} from "./queries";
import { ENRICHMENT_JOB, requestEnrichment, runEnrichment } from "./service";
import type { ReadResult, Reading } from "./website/read";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const form = {
  name: "Acme Design",
  domain: "acme.test",
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
};
const input = (override: Partial<typeof form> = {}) =>
  organizationInput.parse({ ...form, ...override });
const reading = (override: Partial<Reading> = {}): ReadResult => ({
  ok: true,
  reading: {
    fields: {
      website: "https://www.acme.test",
      description: "Anvils, made and mended",
      city: "Pune",
      country: "India",
    },
    guessed: [],
    links: ["https://www.linkedin.com/company/acme"],
    logo: {
      contentType: "image/png",
      bytes: PNG,
      sourceUrl: "https://www.acme.test/touch.png",
    },
    people: [],
    rendered: false,
    ...override,
  },
});

describe("enrichment", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  async function create(override: Partial<typeof form> = {}) {
    const result = await createOrganization(ownerId, input(override), {
      confirmSimilar: true,
    });
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  async function add(firstName: string, lastName: string, organizationId: string) {
    const result = await createContact(
      ownerId,
      newContactInput.parse({
        firstName,
        lastName,
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

  // Runs whatever is queued with a stand-in for the website.
  const work = (result: ReadResult | Error, seen: string[] = []) =>
    runDueJobs(
      {
        [ENRICHMENT_JOB]: (job) =>
          runEnrichment(job, async (url) => {
            seen.push(url);
            if (result instanceof Error) throw result;
            return result;
          }),
      },
      10_000,
    );

  const fromWebsite = async (id: string) =>
    (await websiteFields(ownerId, id)).map((row) => row.field).sort();

  // Puts earlier reads outside the one-a-minute limit.
  const aMinuteLater = () =>
    db
      .update(enrichmentRuns)
      .set({ createdAt: new Date(Date.now() - 5 * 60_000) });

  it("queues a read when a company is created with a domain or website", async () => {
    const id = await create();
    const plain = await create({ name: "Borealis", domain: "" });
    const withSite = await create({
      name: "Cobalt",
      domain: "",
      website: "http://cobalt.test/about?ref=1",
    });

    expect(await latestRun(ownerId, id)).toMatchObject({
      status: "queued",
      input: { url: "https://acme.test/" },
    });
    expect(await latestRun(ownerId, plain)).toBeNull();
    expect(await latestRun(ownerId, withSite)).toMatchObject({
      input: { url: "http://cobalt.test/" },
    });
    expect(
      await db.$count(jobs, eq(jobs.kind, ENRICHMENT_JOB)),
    ).toBe(2);
  });

  it("fills the empty fields, stores the logo and records where each value came from", async () => {
    const id = await create();
    const seen: string[] = [];

    expect(await work(reading(), seen)).toMatchObject({ done: 1, failed: 0 });

    expect(seen).toEqual(["https://acme.test/"]);
    const organization = await getOrganization(ownerId, id);
    expect(organization).toMatchObject({
      website: "https://www.acme.test",
      description: "Anvils, made and mended",
      city: "Pune",
      region: null,
      country: "India",
      industry: null,
    });
    expect(organization?.logoVersion).toMatch(/^[0-9a-f]{12}$/);
    expect((await listOrganizations(ownerId)).rows[0].logoVersion).toBe(
      organization?.logoVersion,
    );
    expect(await getLogo(ownerId, id)).toMatchObject({
      contentType: "image/png",
      bytes: PNG,
    });
    expect(await websiteFields(ownerId, id)).toEqual(
      expect.arrayContaining([{ field: "city", guessed: false }]),
    );
    expect(await fromWebsite(id)).toEqual([
      "city",
      "country",
      "description",
      "website",
    ]);
    expect(await latestRun(ownerId, id)).toMatchObject({
      status: "done",
      error: null,
    });
    const [run] = await db.select().from(enrichmentRuns);
    expect(run.rawResult).toMatchObject({
      links: ["https://www.linkedin.com/company/acme"],
      logo: { contentType: "image/png", bytes: PNG.length },
      filled: ["website", "description", "city", "country"],
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      actor: "job",
      action: "organization.enrich",
      entityId: id,
      before: { description: null },
      after: { description: "Anvils, made and mended", city: "Pune" },
    });
  });

  it("never replaces what the owner typed", async () => {
    const id = await create({
      website: "https://acme.test/home",
      description: "Typed by hand",
      city: "Mumbai",
    });

    await work(reading());

    expect(await getOrganization(ownerId, id)).toMatchObject({
      website: "https://acme.test/home",
      description: "Typed by hand",
      city: "Mumbai",
      country: "India",
    });
    expect(await fromWebsite(id)).toEqual(["country"]);
  });

  it("fills the company's phone and email, and keeps the ones the owner typed", async () => {
    const id = await create();
    const typed = await create({
      name: "Borealis",
      domain: "borealis.test",
      phone: "+1 555 000 0000",
    });
    const fields = { phone: "+91 20 5550 1234", email: "hello@acme.test" };

    await work(reading({ fields }));

    expect(await getOrganization(ownerId, id)).toMatchObject(fields);
    expect(await getOrganization(ownerId, typed)).toMatchObject({
      phone: "+1 555 000 0000",
      email: "hello@acme.test",
    });
    expect(await fromWebsite(typed)).toEqual(["email"]);
  });

  it("leaves a field alone once the owner has edited or cleared it", async () => {
    const id = await create();
    await work(reading());

    await updateOrganization(
      ownerId,
      id,
      input({
        website: "https://www.acme.test",
        description: "Rewritten by the owner",
        city: "",
        country: "India",
      }),
    );
    expect(await fromWebsite(id)).toEqual(["country", "website"]);

    await aMinuteLater();
    expect((await requestEnrichment(ownerId, id)).ok).toBe(true);
    await work(reading({ fields: { description: "New from the site", city: "Pune", region: "MH" } }));

    expect(await getOrganization(ownerId, id)).toMatchObject({
      description: "Rewritten by the owner",
      city: null,
      region: "MH",
      country: "India",
    });
  });

  it("stores what a read worked out as a guess, and lets what the site states take its place", async () => {
    const id = await create();
    const again = async (override: Partial<Reading>) => {
      await aMinuteLater();
      await requestEnrichment(ownerId, id);
      await work(reading(override));
    };

    await work(
      reading({
        fields: { city: "Pune", country: "India", industry: "Accounting" },
        guessed: ["country", "industry"],
      }),
    );
    expect(await getOrganization(ownerId, id)).toMatchObject({
      country: "India",
      industry: "Accounting",
    });
    expect(await websiteFields(ownerId, id)).toEqual(
      expect.arrayContaining([
        { field: "city", guessed: false },
        { field: "country", guessed: true },
        { field: "industry", guessed: true },
      ]),
    );
    const [run] = await db.select().from(enrichmentRuns);
    expect(run.rawResult).toMatchObject({ guessed: ["country", "industry"] });

    // Another guess is no better than the one already there.
    await again({
      fields: { country: "Nepal", industry: "Legal" },
      guessed: ["country", "industry"],
    });
    expect(await getOrganization(ownerId, id)).toMatchObject({
      country: "India",
      industry: "Accounting",
    });

    await again({ fields: { country: "United Arab Emirates" } });
    expect(await getOrganization(ownerId, id)).toMatchObject({
      country: "United Arab Emirates",
      industry: "Accounting",
    });
    expect(await websiteFields(ownerId, id)).toEqual(
      expect.arrayContaining([
        { field: "country", guessed: false },
        { field: "industry", guessed: true },
      ]),
    );
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "organization.enrich",
      before: { country: "India" },
      after: { country: "United Arab Emirates" },
    });

    // Nor does a guess, or a different statement, unseat what the site stated.
    await again({ fields: { country: "Nepal" }, guessed: ["country"] });
    await again({ fields: { country: "Bhutan" } });
    expect((await getOrganization(ownerId, id))?.country).toBe(
      "United Arab Emirates",
    );
  });

  it("never guesses over what the owner typed or cleared", async () => {
    const id = await create({ industry: "Design" });
    const guess = reading({
      fields: { country: "India", industry: "Accounting" },
      guessed: ["country", "industry"],
    });

    await work(guess);
    expect(await getOrganization(ownerId, id)).toMatchObject({
      country: "India",
      industry: "Design",
    });

    await updateOrganization(ownerId, id, input({ industry: "", country: "" }));
    expect(await websiteFields(ownerId, id)).toEqual([]);
    await aMinuteLater();
    await requestEnrichment(ownerId, id);
    await work(guess);
    await aMinuteLater();
    await requestEnrichment(ownerId, id);
    await work(reading({ fields: { country: "India" } }));

    expect(await getOrganization(ownerId, id)).toMatchObject({
      country: null,
      industry: null,
    });
  });

  it("replaces the logo on a later read and keeps it when the site offers none", async () => {
    const id = await create();
    await work(reading());
    const first = (await getOrganization(ownerId, id))?.logoVersion;

    await aMinuteLater();
    await requestEnrichment(ownerId, id);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);
    await work(
      reading({
        logo: { contentType: "image/jpeg", bytes: jpeg, sourceUrl: "https://acme.test/new.jpg" },
      }),
    );
    expect(await getLogo(ownerId, id)).toMatchObject({
      contentType: "image/jpeg",
      bytes: jpeg,
    });
    expect((await getOrganization(ownerId, id))?.logoVersion).not.toBe(first);

    await aMinuteLater();
    await requestEnrichment(ownerId, id);
    await work(reading({ logo: null }));
    expect(await getLogo(ownerId, id)).toMatchObject({ contentType: "image/jpeg" });
  });

  it("keeps the people a read found as suggestions, and creates no contact", async () => {
    const id = await create();
    const people = [
      { name: "Asha Rao", title: "Founder", photo: null },
      { name: "Vikram Shah", title: null, photo: null },
    ];

    await work(reading({ people, rendered: true }));

    const [run] = await db.select().from(enrichmentRuns);
    expect(run.rawResult).toMatchObject({ people, rendered: true });
    expect(await suggestedPeople(ownerId, id)).toEqual(
      people.map((person) => ({ ...person, matches: [] })),
    );
    expect(await countContacts(ownerId)).toBe(0);
  });

  it("stops suggesting someone who is already a contact at the company, archived or not", async () => {
    const id = await create();
    const elsewhere = await create({ name: "Borealis", domain: "" });
    await work(
      reading({
        people: [
          { name: "Asha Rao", title: "Founder", photo: null },
          { name: "Vikram Shah", title: null, photo: null },
          { name: "Meera Iyer", title: "Director", photo: null },
        ],
      }),
    );

    await add("asha", "RAO", id);
    await setContactArchived(ownerId, await add("Vikram", "Shah", id), true);
    const meera = await add("Meera", "Iyer", elsewhere);

    // Someone of that name at another company may or may not be her: offered, not assumed.
    expect(await suggestedPeople(ownerId, id)).toEqual([
      {
        name: "Meera Iyer",
        title: "Director",
        photo: null,
        matches: [
          { id: meera, name: "Meera Iyer", companies: ["Borealis"], here: false },
        ],
      },
    ]);
  });

  it("offers the contact a suggested person may already be, until the owner says they are", async () => {
    const id = await create();
    const elsewhere = await create({ name: "Borealis", domain: "" });
    // Kept under a fuller name than this company's website uses.
    const komal = await add("Komal", "Bajaj Bhotika", elsewhere);
    const colleague = await add("Komal", "Bhotikar", id);
    await add("Richa", "Sureka", elsewhere);
    await work(
      reading({ people: [{ name: "Komal Bhotika", title: "Partner", photo: null }] }),
    );

    expect(await suggestedPeople(ownerId, id)).toMatchObject([
      {
        name: "Komal Bhotika",
        matches: [
          { id: colleague, name: "Komal Bhotikar", companies: ["Acme Design"], here: true },
          { id: komal, name: "Komal Bajaj Bhotika", companies: ["Borealis"], here: false },
        ],
      },
    ]);

    await addContactCompany(ownerId, komal, id, {
      jobTitle: "Partner",
      listedAs: "Komal Bhotika",
    });

    expect(await suggestedPeople(ownerId, id)).toEqual([]);
    expect(
      (await listContacts(ownerId, { organizationId: id })).rows.map((row) => [
        row.fullName,
        row.jobTitle,
      ]),
    ).toEqual([
      ["Komal Bajaj Bhotika", "Partner"],
      ["Komal Bhotikar", null],
    ]);
  });

  it("goes on suggesting from the last read that worked, and nothing it cannot trust", async () => {
    const id = await create();
    await work(reading({ people: [{ name: "Asha Rao", title: "Founder", photo: null }] }));

    await aMinuteLater();
    await requestEnrichment(ownerId, id);
    await work({ ok: false, error: "unreachable" });
    expect(await suggestedPeople(ownerId, id)).toEqual([
      { name: "Asha Rao", title: "Founder", photo: null, matches: [] },
    ]);

    // A read stored before pictures were looked for.
    await db
      .update(enrichmentRuns)
      .set({ rawResult: { people: [{ name: "Asha Rao", title: "Founder" }] } });
    expect(await suggestedPeople(ownerId, id)).toEqual([
      { name: "Asha Rao", title: "Founder", photo: null, matches: [] },
    ]);

    await db
      .update(enrichmentRuns)
      .set({ rawResult: { people: [{ name: "Asha Rao", title: "Founder", email: "x" }] } });
    expect(await suggestedPeople(ownerId, id)).toEqual([]);
    expect(await suggestedPeople(await createTestOwner("other@example.com"), id)).toEqual([]);
  });

  it("records a site that cannot be read and leaves the company as it was", async () => {
    const id = await create();
    const before = await getOrganization(ownerId, id);

    expect(await work({ ok: false, error: "unreachable" })).toMatchObject({
      done: 1,
      failed: 0,
    });

    expect(await latestRun(ownerId, id)).toMatchObject({
      status: "failed",
      error: "unreachable",
    });
    expect(await getOrganization(ownerId, id)).toEqual(before);
    expect(await db.$count(fieldProvenance)).toBe(0);
    expect(await getLogo(ownerId, id)).toBeNull();
  });

  it("marks the read as failed when something breaks on our side", async () => {
    const id = await create();

    expect(await work(new Error("boom"))).toMatchObject({ done: 0, failed: 1 });

    expect(await latestRun(ownerId, id)).toMatchObject({
      status: "failed",
      error: "error",
    });
  });

  it("limits how often a website is read", async () => {
    const id = await create();
    expect(await requestEnrichment(ownerId, id)).toEqual({
      ok: false,
      reason: "rate_limited",
    });

    // The first read is still waiting, so a second one is not queued beside it.
    await aMinuteLater();
    expect(await requestEnrichment(ownerId, id)).toEqual({
      ok: false,
      reason: "busy",
    });

    await work(reading());
    expect((await requestEnrichment(ownerId, id)).ok).toBe(true);

    await db.insert(enrichmentRuns).values(
      Array.from({ length: 20 }, () => ({
        ownerId,
        organizationId: id,
        input: { url: "https://acme.test/" },
        createdAt: new Date(Date.now() - 10 * 60_000),
      })),
    );
    const other = await create({ name: "Borealis", domain: "" });
    await updateOrganization(
      ownerId,
      other,
      input({ name: "Borealis", domain: "borealis.test" }),
    );
    expect(await requestEnrichment(ownerId, other)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("has nothing to read for a company without a website", async () => {
    const id = await create({ domain: "" });
    expect(await requestEnrichment(ownerId, id)).toEqual({
      ok: false,
      reason: "no_website",
    });
  });

  it("keeps another owner's companies, reads and logos out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const id = await create();
    await work(reading());

    expect(await requestEnrichment(otherId, id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await latestRun(otherId, id)).toBeNull();
    expect(await websiteFields(otherId, id)).toEqual([]);
    expect(await getLogo(otherId, id)).toBeNull();
  });
});
