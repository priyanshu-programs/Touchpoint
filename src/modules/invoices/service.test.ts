import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { files } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { mergeContacts } from "@/modules/contacts/merge";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact, deleteContact } from "@/modules/contacts/service";
import { mergeOrganizations } from "@/modules/organizations/merge";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization, deleteOrganization } from "@/modules/organizations/service";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { docx, pdf } from "@/test/files";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  getInvoice,
  getInvoiceFile,
  invoiceCount,
  invoicesOfRecord,
  listInvoices,
  serviceCategories,
} from "./queries";
import { invoiceInput } from "./schema";
import {
  attachInvoiceFile,
  createInvoice,
  deleteInvoice,
  issueInvoice,
  removeInvoiceFile,
  updateInvoice,
  voidInvoice,
} from "./service";

const refused = (reason: string) => ({ ok: false, reason });

type Form = {
  number: string;
  client: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string;
  status: string;
  lines: unknown[];
  adjustments: unknown[];
};

const line = (description: string, quantity: string, unitPrice: string, category = "") => ({
  description,
  quantity,
  unitPrice,
  category,
});

const baseForm = (client: string): Form => ({
  number: "INV-001",
  client,
  issueDate: "2026-10-01",
  dueDate: "2026-10-16",
  currency: "INR",
  notes: "",
  status: "draft",
  lines: [line("Website design", "1", "1,50,000", "Design")],
  adjustments: [],
});

const asSent = (form: Form) => ({
  ...form,
  lines: JSON.stringify(form.lines),
  adjustments: JSON.stringify(form.adjustments),
});

const parse = (form: Form) => invoiceInput.parse(asSent(form));
const message = (form: Form) => {
  const result = invoiceInput.safeParse(asSent(form));
  return result.success ? null : result.error.issues[0].message;
};

async function createOrg(owner: string, name = "Acme Design") {
  const result = await createOrganization(
    owner,
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
      status: "prospect",
      tags: "",
    }),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function createPerson(owner: string, firstName = "Priya") {
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

describe("invoice input", () => {
  const client = `organization:${crypto.randomUUID()}`;

  it("reads amounts in the invoice's own currency, with quantities and adjustments", () => {
    const input = parse({
      ...baseForm(client),
      lines: [
        line("Website design", "1", "1,50,000", "Design"),
        line("Hosting", "1.5", "333.33", ""),
      ],
      adjustments: [{ reason: "Loyalty discount", amount: "5000" }],
    });
    expect(input).toMatchObject({
      number: "INV-001",
      organizationId: client.slice(13),
      contactId: null,
      notes: null,
      lines: [
        {
          description: "Website design",
          quantity: "1.00",
          unitAmountMinor: 15_000_000,
          amountMinor: 15_000_000,
          serviceCategory: "Design",
        },
        // 1.5 × 333.33 = 499.995, rounded half up.
        { quantity: "1.50", unitAmountMinor: 33_333, amountMinor: 50_000, serviceCategory: null },
      ],
      adjustments: [{ reason: "Loyalty discount", amountMinor: 500_000 }],
    });
    expect(
      parse({ ...baseForm(client), currency: "JPY", lines: [line("Logo", "2", "5000")] }).lines[0],
    ).toMatchObject({ unitAmountMinor: 5000, amountMinor: 10_000 });
    expect(parse({ ...baseForm(`contact:${client.slice(13)}`) })).toMatchObject({
      organizationId: null,
      contactId: client.slice(13),
    });
  });

  it.each([
    ["no number", { number: " " }, "Enter the invoice's number, as it is on the invoice"],
    ["no client", { client: "" }, "Choose who the invoice is for"],
    ["a client of another kind", { client: `opportunity:${crypto.randomUUID()}` }, "Choose who the invoice is for"],
    ["a due date before the issue date", { dueDate: "2026-09-30" }, "The due date cannot be before the issue date"],
    ["an unknown currency", { currency: "XYZ" }, "Choose a currency from the list"],
    ["no lines", { lines: [] }, "An invoice has at least one line"],
    ["a line with no description", { lines: [line(" ", "1", "100")] }, "Describe each line, such as Website design"],
    ["a quantity of 0", { lines: [line("Design", "0", "100")] }, 'Enter a quantity above 0 with at most two decimals for "Design"'],
    ["a negative price", { lines: [line("Design", "1", "-100")] }, 'Enter a price in INR for "Design", such as 25000'],
    ["paise on a yen invoice", { currency: "JPY", lines: [line("Design", "1", "100.50")] }, 'Enter a price in JPY for "Design", such as 25000'],
    ["an adjustment of 0", { adjustments: [{ reason: "Discount", amount: "0" }] }, 'Enter an amount above 0 in INR for "Discount"'],
    ["adjustments above the lines", { adjustments: [{ reason: "Write-off", amount: "2,00,000" }] }, "The adjustments come to more than the lines"],
  ])("refuses %s", (_label, change, expected) => {
    expect(message({ ...baseForm(client), ...change } as Form)).toBe(expected);
  });

  it("refuses unknown fields, in the invoice and in its lines", () => {
    expect(invoiceInput.safeParse({ ...asSent(baseForm(client)), ownerId: "x" }).success).toBe(
      false,
    );
    const withExtra = { ...baseForm(client), lines: [{ ...line("Design", "1", "1"), amountMinor: 9 }] };
    expect(invoiceInput.safeParse(asSent(withExtra)).success).toBe(false);
    expect(
      invoiceInput.safeParse({ ...asSent(baseForm(client)), lines: "not json" }).success,
    ).toBe(false);
    expect(
      invoiceInput.safeParse({ ...asSent(baseForm(client)), status: "void" }).success,
    ).toBe(false);
  });
});

describe("invoices", () => {
  let ownerId: string;
  let acme: string;
  let priya: string;

  const make = async (change: Partial<Form> = {}, owner = ownerId) => {
    const created = await createInvoice(
      owner,
      parse({ ...baseForm(`organization:${acme}`), ...change }),
    );
    if (!created.ok) throw new Error(created.reason);
    return created.id;
  };
  const stored = () =>
    db.select({ id: files.id }).from(files).where(eq(files.ownerId, ownerId));

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    acme = await createOrg(ownerId);
    priya = await createPerson(ownerId);
  });

  it("is kept with its lines and adjustments, and its total worked out", async () => {
    const id = await make({
      lines: [line("Website design", "1", "1,50,000", "Design"), line("Copy", "2", "10,000", "Writing")],
      adjustments: [{ reason: "Discount", amount: "20,000" }],
    });
    const invoice = await getInvoice(ownerId, id);
    expect(invoice).toMatchObject({
      number: "INV-001",
      status: "draft",
      clientName: "Acme Design",
      organizationId: acme,
      subtotal: 17_000_000,
      total: 15_000_000,
      lines: [{ description: "Website design" }, { description: "Copy", quantity: "2.00" }],
      adjustments: [{ reason: "Discount", amountMinor: 2_000_000 }],
    });
    const { rows } = await listInvoices(ownerId);
    expect(rows).toMatchObject([{ id, total: 15_000_000, clientName: "Acme Design" }]);
    expect(await serviceCategories(ownerId)).toEqual(["Design", "Writing"]);

    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({ action: "invoice.create", entityId: id });
  });

  it("refuses a number the owner already has, whatever its case", async () => {
    await make();
    expect(
      await createInvoice(ownerId, parse({ ...baseForm(`organization:${acme}`), number: "inv-001" })),
    ).toEqual(refused("number_taken"));
    const other = await make({ number: "INV-002" });
    expect(
      await updateInvoice(ownerId, other, parse({ ...baseForm(`organization:${acme}`), number: "Inv-001" })),
    ).toEqual(refused("number_taken"));
    // Another owner may use the same number for their own client.
    const stranger = await createTestOwner("stranger@example.com");
    const theirs = await createOrg(stranger);
    expect(
      (await createInvoice(stranger, parse(baseForm(`organization:${theirs}`)))).ok,
    ).toBe(true);
  });

  it("bills only a company or person of the owner's", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    const theirs = await createOrg(stranger, "Their Co");
    const theirPerson = await createPerson(stranger, "Ravi");
    expect(await createInvoice(ownerId, parse(baseForm(`organization:${theirs}`)))).toEqual(
      refused("unknown_client"),
    );
    expect(await createInvoice(ownerId, parse(baseForm(`contact:${theirPerson}`)))).toEqual(
      refused("unknown_client"),
    );
    const id = await make();
    expect(
      await updateInvoice(ownerId, id, parse(baseForm(`organization:${theirs}`))),
    ).toEqual(refused("unknown_client"));

    const personal = await make({ number: "INV-002", client: `contact:${priya}` });
    expect(await invoicesOfRecord(ownerId, { contactId: priya })).toMatchObject([
      { id: personal },
    ]);
    expect(await invoicesOfRecord(ownerId, { organizationId: acme })).toMatchObject([{ id }]);
  });

  it("is seen and changed by its owner only", async () => {
    const id = await make();
    const stranger = await createTestOwner("stranger@example.com");
    expect(await getInvoice(stranger, id)).toBeNull();
    expect((await listInvoices(stranger)).rows).toEqual([]);
    expect(await issueInvoice(stranger, id)).toEqual(refused("not_found"));
    expect(await deleteInvoice(stranger, id)).toEqual(refused("not_found"));
    expect(await attachInvoiceFile(stranger, id, { name: "a.pdf", bytes: pdf() })).toEqual(
      refused("not_found"),
    );
    expect(await removeInvoiceFile(stranger, id)).toBe(false);
  });

  it("replaces its lines and adjustments as a set when edited", async () => {
    const id = await make({ adjustments: [{ reason: "Discount", amount: "1000" }] });
    const edit = parse({
      ...baseForm(`contact:${priya}`),
      number: "INV-001A",
      lines: [line("Retainer", "3", "40,000")],
    });
    expect(await updateInvoice(ownerId, id, edit)).toEqual({ ok: true, id });
    expect(await getInvoice(ownerId, id)).toMatchObject({
      number: "INV-001A",
      organizationId: null,
      contactId: priya,
      lines: [{ description: "Retainer", amountMinor: 12_000_000 }],
      adjustments: [],
      total: 12_000_000,
    });
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({
      action: "invoice.update",
      before: { number: "INV-001", lines: [{ description: "Website design" }] },
      after: { number: "INV-001A" },
    });
  });

  it("is issued from a draft, voided once issued, and stays void", async () => {
    const id = await make();
    expect(await voidInvoice(ownerId, id)).toEqual(refused("status"));
    expect(await issueInvoice(ownerId, id)).toEqual({ ok: true });
    expect(await issueInvoice(ownerId, id)).toEqual(refused("status"));
    // Issued, it does not go back to being a draft.
    expect(await updateInvoice(ownerId, id, parse(baseForm(`organization:${acme}`)))).toEqual(
      refused("issued"),
    );
    expect(
      (await updateInvoice(
        ownerId,
        id,
        parse({ ...baseForm(`organization:${acme}`), status: "issued", notes: "Sent by email" }),
      )).ok,
    ).toBe(true);
    expect(await deleteInvoice(ownerId, id)).toEqual(refused("status"));

    expect(await voidInvoice(ownerId, id)).toEqual({ ok: true });
    expect((await getInvoice(ownerId, id))?.status).toBe("void");
    expect(
      await updateInvoice(ownerId, id, parse({ ...baseForm(`organization:${acme}`), status: "issued" })),
    ).toEqual(refused("void"));
    expect(await deleteInvoice(ownerId, id)).toEqual(refused("status"));
    const actions = (await listAudit(ownerId, { limit: 3 })).rows.map((row) => row.action);
    expect(actions).toEqual(["invoice.void", "invoice.update", "invoice.issue"]);
  });

  it("is deleted only as a draft, with its file if nothing else uses it", async () => {
    const id = await make();
    expect(await attachInvoiceFile(ownerId, id, { name: "INV-001.pdf", bytes: pdf("one") })).toEqual(
      { ok: true },
    );
    expect(await stored()).toHaveLength(1);
    expect(await deleteInvoice(ownerId, id)).toEqual({ ok: true });
    expect(await getInvoice(ownerId, id)).toBeNull();
    expect(await stored()).toEqual([]);
  });

  it("keeps the exported PDF or picture, and refuses other files", async () => {
    const id = await make();
    expect(await attachInvoiceFile(ownerId, id, { name: "notes.docx", bytes: docx() })).toEqual(
      refused("kind"),
    );
    expect(
      await attachInvoiceFile(ownerId, id, {
        name: "big.pdf",
        bytes: Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]),
      }),
    ).toEqual(refused("too_large"));
    expect(
      await attachInvoiceFile(ownerId, id, { name: "INV/001\u0000.pdf", bytes: pdf("one") }),
    ).toEqual({ ok: true });
    expect(await getInvoiceFile(ownerId, id)).toMatchObject({
      fileName: "INV 001 .pdf",
      contentType: "application/pdf",
    });

    // A new file in place of the old lets the old one go; the same bytes are stored once.
    const other = await make({ number: "INV-002" });
    await attachInvoiceFile(ownerId, other, { name: "same.pdf", bytes: pdf("one") });
    await attachInvoiceFile(ownerId, id, { name: "INV-001 v2.pdf", bytes: pdf("two") });
    expect(await stored()).toHaveLength(2);
    expect(await removeInvoiceFile(ownerId, other)).toBe(true);
    expect(await stored()).toHaveLength(1);
    expect((await getInvoice(ownerId, other))?.fileName).toBeNull();
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({ action: "invoice.file_remove", before: { fileName: "same.pdf" } });
  });

  it("keeps the company or person it bills from being deleted", async () => {
    await make();
    await make({ number: "INV-002", client: `contact:${priya}` });
    expect(await deleteOrganization(ownerId, acme)).toEqual({
      ok: false,
      reason: "invoiced",
      count: 1,
    });
    expect(await deleteContact(ownerId, priya)).toEqual({
      ok: false,
      reason: "invoiced",
      count: 1,
    });
    expect(await invoiceCount(ownerId, { organizationId: acme })).toBe(1);

    // A company with none is deleted as before.
    const bare = await createOrg(ownerId, "Bare Co");
    expect(await deleteOrganization(ownerId, bare)).toEqual({ ok: true });
  });

  it("moves to the company or person kept by a merge", async () => {
    const id = await make();
    const duplicate = await createOrg(ownerId, "Borealis Labs");
    const moved = await make({ number: "INV-002", client: `organization:${duplicate}` });
    expect(
      await mergeOrganizations(ownerId, { keep: acme, other: duplicate, picks: {}, custom: {} }),
    ).toEqual({ ok: true });
    expect(await invoicesOfRecord(ownerId, { organizationId: acme })).toHaveLength(2);
    expect((await getInvoice(ownerId, moved))?.organizationId).toBe(acme);
    expect((await getInvoice(ownerId, id))?.organizationId).toBe(acme);

    const twin = await createPerson(ownerId, "Meera");
    const personal = await make({ number: "INV-003", client: `contact:${twin}` });
    expect(
      await mergeContacts(ownerId, { keep: priya, other: twin, picks: {}, custom: {} }),
    ).toEqual({ ok: true });
    expect((await getInvoice(ownerId, personal))?.contactId).toBe(priya);
  });

  it("is listed, searched, filtered and sorted", async () => {
    const first = await make({ number: "INV-001", issueDate: "2026-09-01", dueDate: "2026-09-16" });
    const second = await make({
      number: "INV-002",
      client: `contact:${priya}`,
      currency: "USD",
      lines: [line("Audit", "1", "900")],
    });
    await issueInvoice(ownerId, second);

    expect((await listInvoices(ownerId)).rows.map((row) => row.id)).toEqual([second, first]);
    expect((await listInvoices(ownerId, { q: "priya" })).rows.map((row) => row.id)).toEqual([
      second,
    ]);
    expect((await listInvoices(ownerId, { q: "001" })).rows.map((row) => row.id)).toEqual([first]);
    expect((await listInvoices(ownerId, { status: "issued" })).total).toBe(1);
    expect((await listInvoices(ownerId, { currency: "INR" })).rows[0].id).toBe(first);
    expect((await listInvoices(ownerId, { contactId: priya })).rows[0].id).toBe(second);
    expect(
      (await listInvoices(ownerId, { sort: "total", dir: "asc" })).rows.map((row) => row.id),
    ).toEqual([second, first]);
    expect(
      (await listInvoices(ownerId, { sort: "number", dir: "asc" })).rows.map((row) => row.id),
    ).toEqual([first, second]);
  });

  it("goes with its owner's account, clients and all", async () => {
    await make();
    await db.execute(`delete from "user" where id = '${ownerId}'`);
    expect((await listInvoices(ownerId)).total).toBe(0);
  });
});
