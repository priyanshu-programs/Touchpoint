import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { materialSends } from "@/db/schema";
import { listTimeline } from "@/modules/activities/queries";
import { listAudit } from "@/modules/audit/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { saveSettings } from "@/modules/settings/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getMaterial, listMaterialSends, listSendable } from "./queries";
import { newMaterialInput, sendInput, SENDS_PER_MINUTE } from "./schema";
import {
  addVersionLink,
  createMaterial,
  deleteMaterial,
  logSend,
  removeSend,
  removeVersion,
  setSendStatus,
} from "./service";

const ZONE = "Asia/Kolkata";
const someone = "7f1c2f0e-4b7a-4a0e-9d55-0d6f2f6a3c11";
const form = {
  versionId: someone,
  sentAt: "2026-10-18T10:00",
  channel: "whatsapp",
  contactIds: [someone],
  organizationId: "",
  note: "",
};
const refused = (reason: string) => ({ ok: false, reason });

describe("send input", () => {
  it("stores a blank company and note as nothing and drops repeated people", () => {
    expect(sendInput.parse({ ...form, contactIds: [someone, someone] })).toEqual({
      ...form,
      contactIds: [someone],
      organizationId: null,
      note: null,
    });
  });

  it.each([
    ["no one to send to", { contactIds: [] }],
    ["more than 20 people", { contactIds: Array.from({ length: 21 }, () => crypto.randomUUID()) }],
    ["an unknown channel", { channel: "fax" }],
    ["a version that is not an id", { versionId: "v2" }],
    ["a time with an offset", { sentAt: "2026-10-18T10:00+05:30" }],
    ["a note over 2,000 characters", { note: "x".repeat(2001) }],
    ["a status set when logging", { status: "accepted" }],
  ])("rejects %s", (_label, override) => {
    expect(sendInput.safeParse({ ...form, ...override }).success).toBe(false);
  });
});

describe("sends", () => {
  let ownerId: string;
  let materialId: string;
  let v1: string;
  let priya: string;
  let arjun: string;
  let acme: string;

  async function createOrg(owner = ownerId) {
    const result = await createOrganization(
      owner,
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
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  }

  async function createPerson(firstName: string, owner = ownerId) {
    const result = await createContact(
      owner,
      newContactInput.parse({
        firstName,
        lastName: "",
        email: "",
        organizationId: "",
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
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  }

  async function addVersion(label: string, id = materialId) {
    const added = await addVersionLink(ownerId, id, { label, url: `https://a.test/${label}` });
    if (!added.ok) throw new Error(added.reason);
    return added.id;
  }

  async function send(override: Partial<typeof form>, owner = ownerId) {
    const result = await logSend(owner, sendInput.parse({ ...form, versionId: v1, ...override }));
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  }

  const statusOf = async (id: string) =>
    (await db.select().from(materialSends).where(eq(materialSends.id, id)))[0]?.status;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await saveSettings(ownerId, {
      baseCurrency: "INR",
      timezone: ZONE,
      weekStart: 1,
      fiscalYearStartMonth: 4,
    });
    const created = await createMaterial(
      ownerId,
      newMaterialInput.parse({ name: "Rate card", type: "quote", description: "", url: "", label: "" }),
    );
    if (!created.ok) throw new Error(created.reason);
    materialId = created.id;
    v1 = await addVersion("v1");
    priya = await createPerson("Priya");
    arjun = await createPerson("Arjun");
    acme = await createOrg();
  });

  it("shows on each person's and the company's timeline, in the owner's time zone", async () => {
    const id = await send({
      contactIds: [priya, arjun],
      organizationId: acme,
      note: "Asked for the weekend rates too",
    });

    for (const filter of [{ contactId: priya }, { contactId: arjun }, { organizationId: acme }]) {
      const { rows } = await listTimeline(ownerId, filter);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventType: "material_send",
        eventId: id,
        kind: "whatsapp",
        title: "Rate card · v1",
        body: "Asked for the weekend rates too",
        status: "sent",
        materialId,
        organizationId: acme,
        occurredAt: new Date("2026-10-18T04:30:00Z"),
      });
      expect(rows[0].contacts.map(({ name }) => name)).toEqual(["Arjun", "Priya"]);
    }

    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({
      action: "material.send",
      entityId: materialId,
      after: { sendId: id, version: "v1", channel: "whatsapp" },
    });
  });

  it("goes only from the owner's version to the owner's people and company", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    const theirs = await createPerson("Meera", stranger);
    const theirCompany = await createOrg(stranger);
    const parse = (override: Partial<typeof form>) =>
      sendInput.parse({ ...form, versionId: v1, contactIds: [priya], ...override });

    expect(await logSend(stranger, parse({ contactIds: [theirs] }))).toEqual(
      refused("unknown_version"),
    );
    expect(await logSend(ownerId, parse({ versionId: crypto.randomUUID() }))).toEqual(
      refused("unknown_version"),
    );
    expect(await logSend(ownerId, parse({ contactIds: [priya, theirs] }))).toEqual(
      refused("unknown_contact"),
    );
    expect(await logSend(ownerId, parse({ organizationId: theirCompany }))).toEqual(
      refused("unknown_organization"),
    );
    expect(await listMaterialSends(ownerId, materialId)).toEqual([]);
  });

  it("marks the older version a person had as superseded when a newer one goes to them", async () => {
    const toPriya = await send({ contactIds: [priya] });
    const toArjun = await send({ contactIds: [arjun] });
    const accepted = await send({ contactIds: [priya], channel: "email" });
    expect(await setSendStatus(ownerId, accepted, "accepted")).toBe(true);
    expect(await setSendStatus(ownerId, toPriya, "viewed")).toBe(true);

    const v2 = await addVersion("v2");
    const newer = await send({ versionId: v2, contactIds: [priya] });
    expect(await statusOf(toPriya)).toBe("superseded");
    // Someone else's copy, and one already answered, are left as they were.
    expect(await statusOf(toArjun)).toBe("sent");
    expect(await statusOf(accepted)).toBe("accepted");
    expect(await statusOf(newer)).toBe("sent");

    // Sending the older version again does not close the newer one.
    await send({ contactIds: [priya] });
    expect(await statusOf(newer)).toBe("sent");

    const [entry] = (await listAudit(ownerId, { limit: 2 })).rows.slice(1);
    expect(entry).toMatchObject({ action: "material.send", after: { superseded: [toPriya] } });
  });

  it("supersedes a send to several people once each of them has had a newer version", async () => {
    const toBoth = await send({ contactIds: [priya, arjun] });
    const v2 = await addVersion("v2");
    await send({ versionId: v2, contactIds: [arjun] });
    expect(await statusOf(toBoth)).toBe("sent");
    const v3 = await addVersion("v3");
    await send({ versionId: v3, contactIds: [priya] });
    expect(await statusOf(toBoth)).toBe("superseded");
  });

  it("has its status changed and is removed by its owner only", async () => {
    const id = await send({ contactIds: [priya] });
    const stranger = await createTestOwner("stranger@example.com");
    expect(await setSendStatus(stranger, id, "accepted")).toBe(false);
    expect(await removeSend(stranger, id)).toBeNull();
    expect(await statusOf(id)).toBe("sent");

    expect(await setSendStatus(ownerId, id, "rejected")).toBe(true);
    expect((await listTimeline(ownerId, { contactId: priya })).rows[0].status).toBe("rejected");
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({
      action: "material.send_status",
      before: { status: "sent" },
      after: { status: "rejected" },
    });

    expect(await removeSend(ownerId, id)).toEqual({ materialId });
    expect((await listTimeline(ownerId, { contactId: priya })).rows).toEqual([]);
  });

  it("keeps a version that was sent, and goes with its material", async () => {
    const id = await send({ contactIds: [priya] });
    expect(await removeVersion(ownerId, { materialId, versionId: v1 })).toEqual(refused("sent"));
    expect((await getMaterial(ownerId, materialId))!.versions).toMatchObject([
      { id: v1, sends: 1 },
    ]);
    expect(await removeSend(ownerId, id)).toEqual({ materialId });
    expect(await removeVersion(ownerId, { materialId, versionId: v1 })).toEqual({ ok: true });

    v1 = await addVersion("v1 again");
    await send({ contactIds: [priya], organizationId: acme });
    expect(await deleteMaterial(ownerId, materialId)).toBe(true);
    expect((await listTimeline(ownerId, { contactId: priya })).rows).toEqual([]);
    expect((await listTimeline(ownerId, { organizationId: acme })).rows).toEqual([]);
  });

  it(`takes at most ${SENDS_PER_MINUTE} sends a minute`, async () => {
    await db.insert(materialSends).values(
      Array.from({ length: SENDS_PER_MINUTE }, () => ({
        ownerId,
        versionId: v1,
        sentAt: new Date(),
        channel: "email" as const,
      })),
    );
    expect(
      await logSend(ownerId, sendInput.parse({ ...form, versionId: v1, contactIds: [priya] })),
    ).toEqual(refused("rate"));
  });

  it("lists a material's sends with who they went to, and what can be sent", async () => {
    const v2 = await addVersion("v2");
    await send({ contactIds: [priya, arjun], organizationId: acme, sentAt: "2026-10-17T09:00" });
    await send({ versionId: v2, contactIds: [arjun], sentAt: "2026-10-18T09:00" });

    expect(await listMaterialSends(ownerId, materialId)).toMatchObject([
      { versionLabel: "v2", contacts: [{ name: "Arjun" }], organizationName: null },
      {
        versionLabel: "v1",
        status: "sent",
        contacts: [{ name: "Arjun" }, { name: "Priya" }],
        organizationName: "Acme Design",
      },
    ]);
    const stranger = await createTestOwner("stranger@example.com");
    expect(await listMaterialSends(stranger, materialId)).toEqual([]);

    // A material without a version has nothing to send.
    await createMaterial(
      ownerId,
      newMaterialInput.parse({ name: "Deck", type: "deck", description: "", url: "", label: "" }),
    );
    expect(await listSendable(ownerId)).toEqual([
      { id: materialId, name: "Rate card", versions: [{ id: v2, label: "v2" }, { id: v1, label: "v1" }] },
    ]);
  });
});
