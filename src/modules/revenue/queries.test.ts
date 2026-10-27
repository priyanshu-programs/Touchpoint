import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { payments } from "@/db/schema";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { listInvoices } from "@/modules/invoices/queries";
import { invoiceInput } from "@/modules/invoices/schema";
import { createInvoice, voidInvoice } from "@/modules/invoices/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { listPayments } from "@/modules/payments/queries";
import { paymentInput } from "@/modules/payments/schema";
import { recordPayment } from "@/modules/payments/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { periodRange } from "./period";
import { hasMoney, revenueSummary } from "./queries";

const TODAY = "2026-10-27";
const OCTOBER = periodRange("this-month", TODAY);

describe("revenue summary", () => {
  let ownerId: string;
  let maple: string;
  let priya: string;
  const ids: Record<string, string> = {};

  const invoice = async ({ price = "1,00,000", ...change }: Record<string, string>) => {
    const created = await createInvoice(
      ownerId,
      invoiceInput.parse({
        number: `INV-${crypto.randomUUID().slice(0, 8)}`,
        client: `organization:${maple}`,
        issueDate: "2026-10-01",
        dueDate: "2026-10-16",
        currency: "INR",
        notes: "",
        status: "issued",
        lines: JSON.stringify([
          { description: "Website design", quantity: "1", unitPrice: price, category: "" },
        ]),
        adjustments: "[]",
        ...change,
      }),
    );
    if (!created.ok) throw new Error(created.reason);
    return created.id;
  };

  const pay = async (change: Record<string, unknown>) => {
    const result = await recordPayment(
      ownerId,
      paymentInput.parse({
        client: `organization:${maple}`,
        receivedOn: "2026-10-20",
        amount: "40,000",
        currency: "INR",
        rate: "",
        method: "bank_transfer",
        reference: crypto.randomUUID().slice(0, 8),
        notes: "",
        idempotencyKey: crypto.randomUUID(),
        confirmDuplicate: "",
        allocations: "[]",
        ...change,
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  };

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    const org = await createOrganization(
      ownerId,
      organizationInput.parse({
        name: "Maple Studio",
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
    const person = await createContact(
      ownerId,
      newContactInput.parse({
        firstName: "Priya",
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
    if (!org.ok || !person.ok) throw new Error("setup");
    maple = org.id;
    priya = person.id;

    // Paid in part and past due.
    ids.partly = await invoice({});
    await pay({ allocations: JSON.stringify([{ invoiceId: ids.partly, amount: "40,000" }]) });
    // Owing, not yet due.
    ids.unpaid = await invoice({ issueDate: "2026-10-10", dueDate: "2026-11-30", price: "50,000" });
    // Neither counts as invoiced.
    await invoice({ issueDate: "2026-10-05", status: "draft" });
    ids.voided = await invoice({ issueDate: "2026-10-03" });
    await voidInvoice(ownerId, ids.voided);
    // Issued last month and still owing: outstanding, not invoiced in October.
    ids.september = await invoice({ issueDate: "2026-09-15", dueDate: "2026-09-30", price: "20,000" });
    await pay({ receivedOn: "2026-09-20", amount: "5,000" });
    // Paid in full, in dollars, at a stored rate.
    ids.dollars = await invoice({
      client: `contact:${priya}`,
      issueDate: "2026-10-12",
      dueDate: "2026-10-27",
      currency: "USD",
      price: "1,000",
    });
    await pay({
      client: `contact:${priya}`,
      amount: "1,000",
      currency: "USD",
      rate: "83.25",
      allocations: JSON.stringify([{ invoiceId: ids.dollars, amount: "1,000" }]),
    });
    // A payment whose rate is missing, as one recorded before the base currency changed.
    const euros = await pay({ amount: "300", currency: "EUR", rate: "90", receivedOn: "2026-10-21" });
    await db.update(payments).set({ fxRateToBase: null }).where(eq(payments.id, euros));
  });

  const summary = (options: Partial<Parameters<typeof revenueSummary>[1]> = {}) =>
    revenueSummary(ownerId, { range: OCTOBER, today: TODAY, baseCurrency: "INR", ...options });

  it("counts what came in during the period, in rupees, with dollars at their stored rate", async () => {
    expect((await summary()).received).toEqual({
      minor: 4_000_000 + 8_325_000,
      count: 3,
      converted: [{ currency: "USD", minor: 100_000, count: 1 }],
      unconverted: [{ currency: "EUR", minor: 30_000, count: 1 }],
    });
  });

  it("counts issued invoices dated in the period, per currency, leaving drafts and void ones out", async () => {
    expect((await summary()).invoiced).toEqual([
      { currency: "INR", minor: 15_000_000, count: 2 },
      { currency: "USD", minor: 100_000, count: 1 },
    ]);
  });

  it("counts what is owed today whatever the period, with what is past due", async () => {
    const expected = [
      { currency: "INR", minor: 13_000_000, count: 3, overdueMinor: 8_000_000, overdueCount: 2 },
    ];
    expect((await summary()).outstanding).toEqual(expected);
    expect((await summary({ range: periodRange("last-month", TODAY) })).outstanding).toEqual(expected);
  });

  it("narrows every figure to one client", async () => {
    const forPriya = await summary({ client: { contactId: priya } });
    expect(forPriya.received).toMatchObject({ minor: 8_325_000, count: 1, unconverted: [] });
    expect(forPriya.invoiced).toEqual([{ currency: "USD", minor: 100_000, count: 1 }]);
    expect(forPriya.outstanding).toEqual([]);
  });

  it("takes in everything for all time", async () => {
    const all = await summary({ range: {} });
    expect(all.received.minor).toBe(4_000_000 + 500_000 + 8_325_000);
    expect(all.invoiced[0]).toEqual({ currency: "INR", minor: 17_000_000, count: 3 });
  });

  it("matches, row for row, the lists each figure opens", async () => {
    const result = await summary();
    expect((await listPayments(ownerId, OCTOBER)).total).toBe(result.received.count);
    const [rupees] = result.invoiced;
    expect(
      (await listInvoices(ownerId, { ...OCTOBER, state: { is: "issued", today: TODAY }, currency: "INR" }))
        .total,
    ).toBe(rupees.count);
    const [owed] = result.outstanding;
    const owing = await listInvoices(ownerId, {
      state: { is: "outstanding", today: TODAY },
      currency: "INR",
    });
    expect(owing.total).toBe(owed.count);
    expect(owing.rows.reduce((sum, row) => sum + row.balance, 0)).toBe(owed.minor);
    const late = await listInvoices(ownerId, { state: { is: "overdue", today: TODAY }, currency: "INR" });
    expect(late.rows.map((row) => row.id).sort()).toEqual([ids.partly, ids.september].sort());
    expect(late.rows.reduce((sum, row) => sum + row.balance, 0)).toBe(owed.overdueMinor);
  });

  it("shows another owner nothing", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    expect(await revenueSummary(stranger, { range: {}, today: TODAY, baseCurrency: "INR" })).toEqual({
      received: { minor: 0, count: 0, converted: [], unconverted: [] },
      invoiced: [],
      outstanding: [],
    });
    expect(await hasMoney(stranger)).toBe(false);
    expect(await hasMoney(ownerId)).toBe(true);
  });
});
