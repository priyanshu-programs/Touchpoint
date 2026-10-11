import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { enrichmentRuns, fieldProvenance, jobs } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { runDueJobs } from "@/modules/jobs/service";
import { getOrganization, listOrganizations } from "@/modules/organizations/queries";
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  updateOrganization,
} from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getLogo, latestRun, websiteFields } from "./queries";
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
    links: ["https://www.linkedin.com/company/acme"],
    logo: {
      contentType: "image/png",
      bytes: PNG,
      sourceUrl: "https://www.acme.test/touch.png",
    },
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
    expect((await websiteFields(ownerId, id)).sort()).toEqual([
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
    expect(await websiteFields(ownerId, id)).toEqual(["country"]);
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
    expect(await websiteFields(ownerId, typed)).toEqual(["email"]);
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
    expect((await websiteFields(ownerId, id)).sort()).toEqual([
      "country",
      "website",
    ]);

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
