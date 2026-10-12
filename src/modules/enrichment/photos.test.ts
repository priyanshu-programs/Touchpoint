import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  contactOrganizations,
  contactPhotos,
  enrichmentRuns,
  fieldProvenance,
  jobs,
} from "@/db/schema";
import { FetchError, type Fetcher } from "@/lib/safe-fetch";
import { listAudit } from "@/modules/audit/service";
import { getContact, listContacts } from "@/modules/contacts/queries";
import { newContactInput } from "@/modules/contacts/schema";
import {
  createContact,
  deleteContact,
  setContactArchived,
} from "@/modules/contacts/service";
import { runDueJobs } from "@/modules/jobs/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { grainy, shape, solid } from "@/test/pictures";
import {
  fetchPhoto,
  MAX_PHOTO_DOWNLOAD,
  PHOTO_JOB,
  removeContactPhoto,
  requestKnownPhotos,
  requestPhoto,
} from "./photos";
import { getPhoto } from "./queries";
import { ENRICHMENT_JOB, runEnrichment } from "./service";

// A photograph as a team page serves it, far larger than the 40 pixels it is shown at.
const JPEG = await grainy("jpeg", 1600, 1200);
const PNG = await solid("png", 300, 200);
const ASHA = "https://acme.test/people/asha.jpg";

describe("contact photos", () => {
  let ownerId: string;
  let organizationId: string;

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
    organizationId = organization.id;
  });

  async function add(firstName: string, lastName: string, owner = ownerId) {
    const result = await createContact(
      owner,
      newContactInput.parse({
        firstName,
        lastName,
        organizationId: owner === ownerId ? organizationId : "",
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

  const image = (body: Buffer, override: Partial<Awaited<ReturnType<Fetcher>>> = {}) =>
    ({
      url: ASHA,
      status: 200,
      contentType: "image/jpeg",
      body,
      truncated: false,
      ...override,
    }) satisfies Awaited<ReturnType<Fetcher>>;

  // Runs the queued downloads with a stand-in for the website.
  const work = (answer: Awaited<ReturnType<Fetcher>> | Error, seen: string[] = []) =>
    runDueJobs(
      {
        [PHOTO_JOB]: (job) =>
          fetchPhoto(job, async (url, options) => {
            seen.push(`${url} ${options.maxBytes}`);
            if (answer instanceof Error) throw answer;
            return answer;
          }),
      },
      10_000,
    );

  it("stores a picture shrunk and repacked, and gives the contact a version to address it by", async () => {
    const id = await add("Asha", "Rao");
    const seen: string[] = [];

    await requestPhoto(ownerId, id, ASHA);
    expect(await work(image(JPEG), seen)).toMatchObject({ done: 1, failed: 0 });

    expect(seen).toEqual([`${ASHA} ${MAX_PHOTO_DOWNLOAD}`]);
    const stored = await getPhoto(ownerId, id);
    expect(stored?.contentType).toBe("image/webp");
    expect(await shape(stored!.bytes)).toMatchObject({
      format: "webp",
      width: 256,
      height: 192,
    });
    expect(JPEG.length).toBeGreaterThan(500_000);
    expect(stored!.bytes.length).toBeLessThan(40_000);
    const version = (await getContact(ownerId, id))?.photoVersion;
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(
      (await listContacts(ownerId, { organizationId })).rows[0].photoVersion,
    ).toBe(version);

    // A later picture replaces it, under a new version.
    await requestPhoto(ownerId, id, ASHA);
    await work(image(PNG));
    expect(await shape((await getPhoto(ownerId, id))!.bytes)).toMatchObject({
      format: "webp",
      width: 256,
      height: 171,
    });
    expect((await getContact(ownerId, id))?.photoVersion).not.toBe(version);
  });

  it.each([
    ["is cut off at the size limit", image(JPEG, { truncated: true })],
    ["only starts like one", image(JPEG.subarray(0, 2_000))],
    ["is not an image", image(Buffer.from("<html>sign in</html>"))],
    ["is an SVG", image(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))],
    ["is an icon file", image(Buffer.from([0, 0, 1, 0, 1, 0]))],
    ["is missing", image(JPEG, { status: 404 })],
    ["cannot be fetched", new FetchError("blocked")],
  ])("leaves the contact with initials when the picture %s", async (_label, answer) => {
    const id = await add("Asha", "Rao");
    await requestPhoto(ownerId, id, ASHA);

    expect(await work(answer)).toMatchObject({ done: 1, failed: 0 });

    expect(await getPhoto(ownerId, id)).toBeNull();
    expect((await getContact(ownerId, id))?.photoVersion).toBeNull();
  });

  it("queues one download per contact, and none for an address that is not a web address", async () => {
    const id = await add("Asha", "Rao");

    expect(await requestPhoto(ownerId, id, ASHA)).not.toBeNull();
    expect(await requestPhoto(ownerId, id, ASHA)).toBeNull();
    await work(image(JPEG));
    const first = await getPhoto(ownerId, id);

    await requestPhoto(ownerId, id, "file:///etc/passwd");
    expect(await work(image(PNG))).toMatchObject({ done: 0, failed: 1 });
    expect(await getPhoto(ownerId, id)).toEqual(first);
  });

  it("gives a picture to people a read found who are already contacts there and have none", async () => {
    const asha = await add("asha", "RAO");
    const vikram = await add("Vikram", "Shah");
    const archived = await add("Meera", "Iyer");
    await setContactArchived(ownerId, archived, true);
    await requestPhoto(ownerId, vikram, "https://acme.test/old.jpg");
    await work(image(PNG));
    const people = [
      { name: "Asha Rao", title: "Founder", photo: ASHA },
      { name: "Vikram Shah", title: null, photo: "https://acme.test/new.jpg" },
      { name: "Meera Iyer", title: null, photo: "https://acme.test/meera.jpg" },
      { name: "Kabir Mehta", title: null, photo: "https://acme.test/kabir.jpg" },
      { name: "Zoya Khan", title: null, photo: null },
    ];

    await db.transaction((tx) =>
      requestKnownPhotos(tx, ownerId, organizationId, people),
    );

    const queued = await db
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.status, "pending"));
    expect(queued).toEqual([{ payload: { contactId: asha, url: ASHA } }]);
  });

  it("finds someone by the name the company's website lists them under", async () => {
    const komal = await add("Komal", "Bajaj Bhotika");
    await db
      .update(contactOrganizations)
      .set({ listedAs: "Komal Bhotika" })
      .where(eq(contactOrganizations.contactId, komal));

    await db.transaction((tx) =>
      requestKnownPhotos(tx, ownerId, organizationId, [
        { name: "Komal Bhotika", title: "Partner", photo: ASHA },
      ]),
    );

    expect(
      await db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.status, "pending")),
    ).toEqual([{ payload: { contactId: komal, url: ASHA } }]);
  });

  it("queues those pictures when a website read finishes", async () => {
    const asha = await add("Asha", "Rao");
    const [{ id: runId }] = await db
      .insert(enrichmentRuns)
      .values({ ownerId, organizationId, input: { url: "https://acme.test/" } })
      .returning();
    await db.insert(jobs).values({
      kind: ENRICHMENT_JOB,
      ownerId,
      payload: { runId },
    });

    await runDueJobs(
      {
        [ENRICHMENT_JOB]: (job) =>
          runEnrichment(job, async () => ({
            ok: true,
            reading: {
              fields: {},
              guessed: [],
              links: [],
              logo: null,
              people: [{ name: "Asha Rao", title: "Founder", photo: ASHA }],
              rendered: false,
            },
          })),
        [PHOTO_JOB]: (job) => fetchPhoto(job, async () => image(JPEG)),
      },
      10_000,
    );

    expect(await getPhoto(ownerId, asha)).toMatchObject({ contentType: "image/webp" });
  });

  it("keeps a removed picture away for good", async () => {
    const id = await add("Asha", "Rao");
    await requestPhoto(ownerId, id, ASHA);
    await work(image(JPEG));

    expect(await removeContactPhoto(ownerId, id)).toBe(true);

    expect(await getPhoto(ownerId, id)).toBeNull();
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "contact.remove_photo",
      entityId: id,
      before: { photo: ASHA },
    });
    expect(await removeContactPhoto(ownerId, id)).toBe(false);

    // Neither a later read nor a download already on its way brings it back.
    await db.transaction((tx) =>
      requestKnownPhotos(tx, ownerId, organizationId, [
        { name: "Asha Rao", title: null, photo: ASHA },
      ]),
    );
    expect(await db.$count(jobs, eq(jobs.status, "pending"))).toBe(0);
    await requestPhoto(ownerId, id, ASHA);
    await work(image(JPEG));
    expect(await getPhoto(ownerId, id)).toBeNull();
  });

  it("goes with the contact, and stays out of another owner's reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    const theirs = await add("Asha", "Rao", otherId);
    const id = await add("Asha", "Rao");
    await requestPhoto(ownerId, id, ASHA);
    await work(image(JPEG));
    await removeContactPhoto(ownerId, id);
    await requestPhoto(otherId, theirs, ASHA);
    await work(image(JPEG));
    const kept = await getPhoto(otherId, theirs);

    expect(kept).not.toBeNull();
    expect(await getPhoto(ownerId, theirs)).toBeNull();
    expect(await removeContactPhoto(ownerId, theirs)).toBe(false);
    // A download queued under the wrong owner stores nothing.
    await requestPhoto(ownerId, theirs, ASHA);
    await work(image(PNG));
    expect(await getPhoto(otherId, theirs)).toEqual(kept);

    await deleteContact(otherId, theirs);
    await deleteContact(ownerId, id);
    expect(await db.$count(contactPhotos)).toBe(0);
    expect(await db.$count(fieldProvenance)).toBe(0);
  });
});
