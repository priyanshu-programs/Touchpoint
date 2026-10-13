import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
import { getOrganization } from "@/modules/organizations/queries";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { listCompanyStatuses } from "./queries";
import { MAX_COMPANY_STATUSES, statusColor, statusInput } from "./schema";
import {
  createCompanyStatus,
  deleteCompanyStatus,
  renameCompanyStatus,
  setCompanyStatusColor,
} from "./service";

const status = (label: string, color = "#14b8a6") =>
  statusInput.parse({ label, color });

const BUILT_IN = [
  { key: "prospect", label: "Prospect", color: "#3b82f6", builtIn: true },
  { key: "client", label: "Client", color: "#22c55e", builtIn: true },
  { key: "past_client", label: "Past client", color: "#f59e0b", builtIn: true },
  { key: "partner", label: "Partner", color: "#a855f7", builtIn: true },
  { key: "other", label: "Other", color: "#a1a1aa", builtIn: true },
];

describe("statusInput", () => {
  it("trims the name and keeps the colour in lower case", () => {
    expect(statusInput.parse({ label: " Hot lead ", color: " #FF8800 " })).toEqual({
      label: "Hot lead",
      color: "#ff8800",
    });
  });

  it.each([
    ["no name", { label: "  ", color: "#ef4444" }],
    ["a name over 40 characters", { label: "x".repeat(41), color: "#ef4444" }],
    ["no colour", { label: "Hot lead" }],
    ["an unexpected property", { label: "Hot lead", color: "#ef4444", key: "client" }],
  ])("rejects %s", (_label, value) => {
    expect(statusInput.safeParse(value).success).toBe(false);
  });

  // The colour goes into a style, so only its one shape gets through.
  it.each([
    ["a colour's name", "red"],
    ["three digits", "#f80"],
    ["eight digits", "#ff880080"],
    ["digits without the hash", "ff8800"],
    ["letters that are not hex", "#gggggg"],
    ["a colour function", "rgb(255, 136, 0)"],
    ["a class", "bg-red-500"],
    ["more CSS after the colour", "#ff0000;background:url(//example.com)"],
    ["a second line", "#ff0000\n#00ff00"],
    ["nothing", ""],
  ])("rejects %s as a colour", (_label, value) => {
    expect(statusColor.safeParse(value).success).toBe(false);
  });

  it("takes any colour of six hex digits", () => {
    for (const value of ["#000000", "#ffffff", "#ec4899", "#0A1B2C"]) {
      expect(statusColor.safeParse(value).success).toBe(true);
    }
  });
});

describe("company statuses", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
  });

  async function company(name: string, statusKey: string) {
    const result = await createOrganization(
      ownerId,
      organizationInput.parse({
        name,
        domain: "",
        website: "",
        phone: "",
        email: "",
        industry: "",
        description: "",
        city: "",
        region: "",
        country: "",
        status: statusKey,
        tags: "",
      }),
      { confirmSimilar: true },
    );
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return result.id;
  }

  it("starts with the five built-in statuses in their own colours", async () => {
    expect(await listCompanyStatuses(ownerId)).toEqual(BUILT_IN);
  });

  it("adds a status after the built-in ones, with a key from its name and an audit row", async () => {
    expect(await createCompanyStatus(ownerId, status("Hot lead", "#ef4444"))).toEqual({
      ok: true,
      key: "hot_lead",
    });
    expect(await createCompanyStatus(ownerId, status("!!!"))).toEqual({
      ok: true,
      key: "status",
    });

    expect(await listCompanyStatuses(ownerId)).toEqual([
      ...BUILT_IN,
      { key: "hot_lead", label: "Hot lead", color: "#ef4444", builtIn: false },
      { key: "status", label: "!!!", color: "#14b8a6", builtIn: false },
    ]);
    const { rows } = await listAudit(ownerId);
    expect(rows[1]).toMatchObject({
      action: "status.create",
      entityType: "company_status",
      entityId: "hot_lead",
      after: { label: "Hot lead", color: "#ef4444" },
    });
  });

  it("refuses a name a built-in status or one of the owner's already has", async () => {
    await createCompanyStatus(ownerId, status("Hot lead"));

    for (const label of ["client", "PAST CLIENT", "hot LEAD"]) {
      expect(await createCompanyStatus(ownerId, status(label))).toEqual({
        ok: false,
        reason: "label_taken",
      });
    }
    expect(await listCompanyStatuses(ownerId)).toHaveLength(6);
  });

  it("never gives a status the key of a built-in one", async () => {
    // "Past-client" is a different name from "Past client" and makes the same key.
    expect(await createCompanyStatus(ownerId, status("Past-client"))).toEqual({
      ok: true,
      key: "past_client_2",
    });
    expect(await createCompanyStatus(ownerId, status("Past/client"))).toEqual({
      ok: true,
      key: "past_client_3",
    });
  });

  it(`stops at ${MAX_COMPANY_STATUSES} statuses of the owner's own`, async () => {
    // A colour kept for a built-in status is not one of them.
    await setCompanyStatusColor(ownerId, "client", "#ec4899");
    for (let count = 1; count <= MAX_COMPANY_STATUSES; count++) {
      expect(
        (await createCompanyStatus(ownerId, status(`Stage ${count}`))).ok,
      ).toBe(true);
    }

    expect(await createCompanyStatus(ownerId, status("One more"))).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("recolours a built-in status, which keeps its name and its place", async () => {
    expect(await setCompanyStatusColor(ownerId, "client", "#ec4899")).toBe(true);
    expect(await setCompanyStatusColor(ownerId, "client", "#14b8a6")).toBe(true);

    expect(await listCompanyStatuses(ownerId)).toEqual(
      BUILT_IN.map((builtIn) =>
        builtIn.key === "client" ? { ...builtIn, color: "#14b8a6" } : builtIn,
      ),
    );
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "status.update",
      entityId: "client",
      before: { color: "#ec4899" },
      after: { color: "#14b8a6" },
    });
    expect(rows[1]).toMatchObject({
      before: { color: "#22c55e" },
      after: { color: "#ec4899" },
    });

    expect(await renameCompanyStatus(ownerId, "client", "Customer")).toEqual({
      ok: false,
      reason: "built_in",
    });
    expect(await deleteCompanyStatus(ownerId, "client")).toEqual({
      ok: false,
      reason: "built_in",
    });
    expect(await listCompanyStatuses(ownerId)).toHaveLength(5);
  });

  it("recolours and renames one of the owner's, and its companies follow", async () => {
    await createCompanyStatus(ownerId, status("Hot lead", "#ef4444"));
    await createCompanyStatus(ownerId, status("Cold"));
    const id = await company("Acme Design", "hot_lead");

    expect(await setCompanyStatusColor(ownerId, "hot_lead", "#f97316")).toBe(true);
    expect(await renameCompanyStatus(ownerId, "hot_lead", "Warm lead")).toEqual({
      ok: true,
      key: "hot_lead",
    });
    // Its own name in other letters is no clash; another status's name is.
    expect(await renameCompanyStatus(ownerId, "hot_lead", "WARM lead")).toEqual({
      ok: true,
      key: "hot_lead",
    });
    for (const label of ["cold", "Partner"]) {
      expect(await renameCompanyStatus(ownerId, "hot_lead", label)).toEqual({
        ok: false,
        reason: "label_taken",
      });
    }

    expect((await listCompanyStatuses(ownerId))[5]).toEqual({
      key: "hot_lead",
      label: "WARM lead",
      color: "#f97316",
      builtIn: false,
    });
    expect(await getOrganization(ownerId, id)).toMatchObject({
      status: "hot_lead",
    });
    expect(await setCompanyStatusColor(ownerId, "nobody_has_this", "#ef4444")).toBe(
      false,
    );
    expect(await renameCompanyStatus(ownerId, "nobody_has_this", "X")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("deletes one of the owner's and moves its companies to Other", async () => {
    await createCompanyStatus(ownerId, status("Hot lead"));
    const first = await company("Acme Design", "hot_lead");
    const second = await company("Borealis Labs", "hot_lead");
    const client = await company("Cobalt Works", "client");

    expect(await deleteCompanyStatus(ownerId, "hot_lead")).toEqual({
      ok: true,
      key: "hot_lead",
    });

    expect(await listCompanyStatuses(ownerId)).toEqual(BUILT_IN);
    for (const id of [first, second]) {
      expect(await getOrganization(ownerId, id)).toMatchObject({
        status: "other",
      });
    }
    expect(await getOrganization(ownerId, client)).toMatchObject({
      status: "client",
    });
    const { rows } = await listAudit(ownerId);
    expect(rows[0]).toMatchObject({
      action: "status.delete",
      entityId: "hot_lead",
      before: { label: "Hot lead", color: "#14b8a6" },
      after: { companiesMoved: 2, movedTo: "other" },
    });
    expect(await deleteCompanyStatus(ownerId, "hot_lead")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("keeps another owner's statuses out of sight and out of reach", async () => {
    const otherId = await createTestOwner("other@example.com");
    await createCompanyStatus(ownerId, status("Hot lead", "#ef4444"));
    await setCompanyStatusColor(ownerId, "client", "#ec4899");
    const id = await company("Acme Design", "hot_lead");

    expect(await listCompanyStatuses(otherId)).toEqual(BUILT_IN);
    expect(await setCompanyStatusColor(otherId, "hot_lead", "#3b82f6")).toBe(false);
    expect(await renameCompanyStatus(otherId, "hot_lead", "Theirs")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteCompanyStatus(otherId, "hot_lead")).toEqual({
      ok: false,
      reason: "not_found",
    });
    // The same name is free for a different owner, under the same key.
    expect(await createCompanyStatus(otherId, status("Hot lead"))).toEqual({
      ok: true,
      key: "hot_lead",
    });
    expect(await deleteCompanyStatus(otherId, "hot_lead")).toEqual({
      ok: true,
      key: "hot_lead",
    });

    expect((await listCompanyStatuses(ownerId))[5]).toMatchObject({
      label: "Hot lead",
      color: "#ef4444",
    });
    expect(await getOrganization(ownerId, id)).toMatchObject({
      status: "hot_lead",
    });
  });
});
