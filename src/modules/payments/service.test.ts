import { beforeEach, describe, expect, it } from "vitest";
import { listAudit } from "@/modules/audit/service";
import { mergeContacts } from "@/modules/contacts/merge";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact, deleteContact } from "@/modules/contacts/service";
import { getInvoice, listInvoices } from "@/modules/invoices/queries";
import { invoiceInput } from "@/modules/invoices/schema";
import {
  createInvoice,
  deleteInvoice,
  updateInvoice,
  voidInvoice,
} from "@/modules/invoices/service";
import { invoiceState } from "@/modules/invoices/state";
import { mergeOrganizations } from "@/modules/organizations/merge";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization, deleteOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getPayment, listPayments, openInvoices, paymentsOfRecord } from "./queries";
import { paymentInput } from "./schema";
import { allocatePayment, deletePayment, recordPayment } from "./service";

const refused = (reason: string) => ({ ok: false, reason });

type Form = {
  client: string;
  receivedOn: string;
  amount: string;
  currency: string;
  rate: string;
  method: string;
  reference: string;
  notes: string;
  idempotencyKey: string;
  confirmDuplicate: string;
  allocations: { invoiceId: string; amount: string }[];
};

const baseForm = (client: string): Form => ({
  client,
  receivedOn: "2026-10-20",
  amount: "50,000",
  currency: "INR",
  rate: "",
  method: "bank_transfer",
  reference: "UTR123",
  notes: "",
  idempotencyKey: crypto.randomUUID(),
  confirmDuplicate: "",
  allocations: [],
});

const asSent = (form: Form) => ({ ...form, allocations: JSON.stringify(form.allocations) });
const parse = (form: Form) => paymentInput.parse(asSent(form));
const message = (form: Form) => {
  const result = paymentInput.safeParse(asSent(form));
  return result.success ? null : result.error.issues[0].message;
};

async function createOrg(owner: string, name = "Maple Studio") {
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

describe("payment input", () => {
  const client = `organization:${crypto.randomUUID()}`;
  const invoiceId = crypto.randomUUID();

  it("reads the amount, the rate and each invoice's amount in the payment's currency", () => {
    expect(
      parse({
        ...baseForm(client),
        currency: "USD",
        amount: "1,200.50",
        rate: "83.25",
        allocations: [
          { invoiceId, amount: "1000" },
          { invoiceId: crypto.randomUUID(), amount: "" },
        ],
      }),
    ).toMatchObject({
      organizationId: client.slice(13),
      contactId: null,
      amountMinor: 120_050,
      fxRateToBase: "83.25000000",
      reference: "UTR123",
      notes: null,
      confirmDuplicate: false,
      allocations: [{ invoiceId, amountMinor: 100_000 }],
    });
    expect(parse({ ...baseForm(client), confirmDuplicate: "yes" }).confirmDuplicate).toBe(true);
  });

  it.each([
    ["no client", { client: "" }, "Choose who paid you"],
    ["no amount", { amount: "0" }, "Enter the amount received in INR, such as 25000"],
    ["a negative amount", { amount: "-5" }, "Enter the amount received in INR, such as 25000"],
    ["a bad rate", { rate: "0" }, "Enter the rate as a number above 0 with at most eight decimals, such as 83.25"],
    ["an unknown method", { method: "barter" }, "Choose how you were paid"],
    ["a bad invoice amount", { allocations: [{ invoiceId, amount: "abc" }] }, "Enter each amount in INR, such as 25000"],
    ["one invoice twice", { allocations: [{ invoiceId, amount: "1" }, { invoiceId, amount: "2" }] }, "Each invoice can be chosen once"],
    ["more to invoices than was paid", { allocations: [{ invoiceId, amount: "60,000" }] }, "The amounts for the invoices come to more than the payment"],
  ])("refuses %s", (_label, change, expected) => {
    expect(message({ ...baseForm(client), ...change } as Form)).toBe(expected);
  });

  it("refuses unknown fields and a key that is not a uuid", () => {
    expect(paymentInput.safeParse({ ...asSent(baseForm(client)), ownerId: "x" }).success).toBe(
      false,
    );
    expect(
      paymentInput.safeParse({ ...asSent(baseForm(client)), idempotencyKey: "1" }).success,
    ).toBe(false);
    expect(
      paymentInput.safeParse({
        ...asSent(baseForm(client)),
        allocations: JSON.stringify([{ invoiceId, amount: "1", amountMinor: 5 }]),
      }).success,
    ).toBe(false);
  });
});

describe("invoice state", () => {
  const issued = { status: "issued" as const, dueDate: "2026-10-16" };

  it("is worked out from the status, what was paid and the due date", () => {
    expect(invoiceState({ ...issued, status: "draft", paid: 0, balance: 5 }, "2026-10-01")).toBe("draft");
    expect(invoiceState({ ...issued, status: "void", paid: 0, balance: 5 }, "2026-12-01")).toBe("void");
    expect(invoiceState({ ...issued, paid: 0, balance: 5 }, "2026-10-16")).toBe("unpaid");
    expect(invoiceState({ ...issued, paid: 2, balance: 3 }, "2026-10-01")).toBe("partly_paid");
    expect(invoiceState({ ...issued, paid: 2, balance: 3 }, "2026-10-17")).toBe("overdue");
    expect(invoiceState({ ...issued, paid: 5, balance: 0 }, "2026-12-01")).toBe("paid");
  });
});

describe("payments", () => {
  let ownerId: string;
  let maple: string;

  const invoice = async (change: Record<string, unknown> = {}, issue = true) => {
    const created = await createInvoice(
      ownerId,
      invoiceInput.parse({
        number: `INV-${crypto.randomUUID().slice(0, 8)}`,
        client: `organization:${maple}`,
        issueDate: "2026-10-01",
        dueDate: "2026-10-16",
        currency: "INR",
        notes: "",
        status: issue ? "issued" : "draft",
        lines: JSON.stringify([
          { description: "Website design", quantity: "1", unitPrice: "1,00,000", category: "" },
        ]),
        adjustments: "[]",
        ...change,
      }),
    );
    if (!created.ok) throw new Error(created.reason);
    return created.id;
  };
  const pay = (change: Partial<Form> = {}, owner = ownerId) =>
    recordPayment(owner, parse({ ...baseForm(`organization:${maple}`), ...change }));
  const record = async (change: Partial<Form> = {}) => {
    const result = await pay(change);
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  };
  const balance = async (id: string) => (await getInvoice(ownerId, id))!.balance;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    maple = await createOrg(ownerId);
  });

  it("lowers what an invoice owes, part by part, until it is paid", async () => {
    const id = await invoice();
    const first = await record({ allocations: [{ invoiceId: id, amount: "40,000" }], amount: "40,000" });
    expect(await balance(id)).toBe(6_000_000);
    const [row] = (await listInvoices(ownerId)).rows;
    expect(invoiceState(row, "2026-10-10")).toBe("partly_paid");
    expect(invoiceState(row, "2026-10-17")).toBe("overdue");

    await record({
      amount: "60,000",
      reference: "UTR456",
      allocations: [{ invoiceId: id, amount: "60,000" }],
    });
    expect(await balance(id)).toBe(0);
    expect((await listInvoices(ownerId, { state: { is: "paid", today: "2026-12-01" } })).total).toBe(1);
    expect((await listInvoices(ownerId, { state: { is: "overdue", today: "2026-12-01" } })).total).toBe(0);

    expect(await getPayment(ownerId, first)).toMatchObject({
      amountMinor: 4_000_000,
      allocated: 4_000_000,
      unallocated: 0,
      clientName: "Maple Studio",
      allocations: [{ invoiceId: id, amountMinor: 4_000_000 }],
    });
    expect((await getInvoice(ownerId, id))?.allocations).toHaveLength(2);
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({ action: "payment.record", entityType: "payment" });
  });

  it("records one payment when the same form is sent twice", async () => {
    const key = crypto.randomUUID();
    const first = await pay({ idempotencyKey: key });
    const again = await pay({ idempotencyKey: key });
    expect(again).toEqual(first);
    expect((await listPayments(ownerId)).total).toBe(1);
  });

  it("stops a likely duplicate until it is confirmed", async () => {
    await record();
    const second = await pay({ reference: "utr123" });
    expect(second).toMatchObject({
      ok: false,
      reason: "duplicate",
      existing: { amountMinor: 5_000_000, currency: "INR", receivedOn: "2026-10-20" },
    });
    expect((await listPayments(ownerId)).total).toBe(1);

    // Another reference, day or amount is not a duplicate.
    expect((await pay({ reference: "UTR999" })).ok).toBe(true);
    expect((await pay({ receivedOn: "2026-10-21" })).ok).toBe(true);
    expect((await pay({ confirmDuplicate: "yes" })).ok).toBe(true);
    expect((await listPayments(ownerId)).total).toBe(4);
  });

  it("goes only to the client's issued invoices in its currency, never past what they owe", async () => {
    const id = await invoice();
    const draft = await invoice({}, false);
    const dollars = await invoice({ currency: "USD" });
    const voided = await invoice();
    await voidInvoice(ownerId, voided);
    const other = await createOrg(ownerId, "Birch & Co");
    const theirs = await invoice({ client: `organization:${other}` });

    for (const invoiceId of [draft, dollars, voided, theirs]) {
      expect(await pay({ allocations: [{ invoiceId, amount: "1" }] })).toEqual(refused("invoice"));
    }
    expect(
      await pay({ amount: "2,00,000", allocations: [{ invoiceId: id, amount: "1,00,001" }] }),
    ).toEqual(refused("over_balance"));
    expect((await listPayments(ownerId)).total).toBe(0);
  });

  it("checks the client, the date and the rate", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    const strangers = await createOrg(stranger, "Elsewhere Ltd");
    expect(await pay({ client: `organization:${strangers}` })).toEqual(refused("unknown_client"));
    expect(await pay({ receivedOn: "2999-01-01" })).toEqual(refused("future"));
    expect(await pay({ currency: "USD", amount: "500" })).toEqual(refused("no_rate"));

    const usd = await record({ currency: "USD", amount: "500", rate: "83.25" });
    expect((await getPayment(ownerId, usd))?.fxRateToBase).toBe("83.25000000");
    // A rate sent with the base currency is not kept.
    const inr = await record({ rate: "2", reference: "UTR777" });
    expect((await getPayment(ownerId, inr))?.fxRateToBase).toBeNull();

    // Another owner's invoice is not one of the client's.
    const id = await invoice();
    const result = await recordPayment(
      stranger,
      parse({ ...baseForm(`organization:${strangers}`), allocations: [{ invoiceId: id, amount: "1" }] }),
    );
    expect(result).toEqual(refused("invoice"));
    expect(await getPayment(stranger, usd)).toBeNull();
    expect(await deletePayment(stranger, usd)).toBe(false);
  });

  it("keeps what it did not cover, to put towards a later invoice", async () => {
    const advance = await record({ amount: "1,50,000" });
    expect((await getPayment(ownerId, advance))?.unallocated).toBe(15_000_000);

    const id = await invoice();
    const second = await invoice();
    expect(await openInvoices(ownerId, { organizationId: maple }, "INR")).toHaveLength(2);
    expect(
      await allocatePayment(ownerId, advance, [{ invoiceId: id, amountMinor: 1_00_00_001 }]),
    ).toEqual(refused("over_balance"));
    expect(await allocatePayment(ownerId, advance, [{ invoiceId: id, amountMinor: 6_000_000 }])).toEqual({
      ok: true,
    });
    // Again to the same invoice adds to it.
    expect(await allocatePayment(ownerId, advance, [{ invoiceId: id, amountMinor: 4_000_000 }])).toEqual({
      ok: true,
    });
    expect(
      await allocatePayment(ownerId, advance, [{ invoiceId: second, amountMinor: 6_000_000 }]),
    ).toEqual(refused("over_amount"));
    expect(await allocatePayment(ownerId, advance, [{ invoiceId: second, amountMinor: 5_000_000 }])).toEqual({
      ok: true,
    });

    const paid = await getPayment(ownerId, advance);
    expect(paid?.unallocated).toBe(0);
    expect(paid?.allocations).toHaveLength(2);
    expect(paid?.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: id, amountMinor: 10_000_000 }),
        expect.objectContaining({ invoiceId: second, amountMinor: 5_000_000 }),
      ]),
    );
    expect(await openInvoices(ownerId, { organizationId: maple }, "INR")).toMatchObject([
      { id: second, balance: 5_000_000 },
    ]);
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({ action: "payment.allocate", entityId: advance });
  });

  it("holds a paid invoice as it is until its payments are deleted", async () => {
    const id = await invoice();
    const payment = await record({ allocations: [{ invoiceId: id, amount: "10,000" }] });
    const edit = invoiceInput.parse({
      number: "INV-EDIT",
      client: `organization:${maple}`,
      issueDate: "2026-10-01",
      dueDate: "2026-10-16",
      currency: "INR",
      notes: "",
      status: "issued",
      lines: JSON.stringify([{ description: "More", quantity: "1", unitPrice: "5", category: "" }]),
      adjustments: "[]",
    });
    expect(await updateInvoice(ownerId, id, edit)).toEqual(refused("paid"));
    expect(await voidInvoice(ownerId, id)).toEqual(refused("paid"));

    expect(await deletePayment(ownerId, payment)).toBe(true);
    expect(await balance(id)).toBe(10_000_000);
    expect(await updateInvoice(ownerId, id, edit)).toEqual({ ok: true, id });
    expect(await voidInvoice(ownerId, id)).toEqual({ ok: true });
    expect(await deleteInvoice(ownerId, id)).toEqual({ ok: true });
    const [entry] = (await listAudit(ownerId, { limit: 4 })).rows.filter(
      (row) => row.action === "payment.delete",
    );
    expect(entry).toMatchObject({ entityId: payment });
  });

  it("keeps a client with payments from being deleted, and moves with a merge", async () => {
    await record();
    expect(await deleteOrganization(ownerId, maple)).toEqual({
      ok: false,
      reason: "invoiced",
      count: 1,
    });

    const twin = await createOrg(ownerId, "Juniper Works");
    await record({ client: `organization:${twin}`, reference: "UTR-TWIN" });
    expect(
      await mergeOrganizations(ownerId, { keep: maple, other: twin, picks: {}, custom: {} }),
    ).toEqual({ ok: true });
    expect(await paymentsOfRecord(ownerId, { organizationId: maple })).toHaveLength(2);

    const priya = await createPerson(ownerId);
    const priyaTwin = await createPerson(ownerId, "Rohan");
    await record({ client: `contact:${priyaTwin}`, reference: "UTR-P" });
    expect(await deleteContact(ownerId, priyaTwin)).toMatchObject(refused("invoiced"));
    expect(
      await mergeContacts(ownerId, { keep: priya, other: priyaTwin, picks: {}, custom: {} }),
    ).toEqual({ ok: true });
    expect(await paymentsOfRecord(ownerId, { contactId: priya })).toHaveLength(1);
  });

  it("is listed with search, a currency filter and sort", async () => {
    await record({ reference: "UTR-AAA" });
    await record({ reference: "UTR-BBB", amount: "500", currency: "USD", rate: "83" });
    expect((await listPayments(ownerId, { q: "bbb" })).rows).toHaveLength(1);
    expect((await listPayments(ownerId, { q: "maple" })).total).toBe(2);
    expect((await listPayments(ownerId, { currency: "USD" })).rows[0].reference).toBe("UTR-BBB");
    expect(
      (await listPayments(ownerId, { sort: "amount", dir: "asc" })).rows.map((row) => row.reference),
    ).toEqual(["UTR-BBB", "UTR-AAA"]);
  });
});
