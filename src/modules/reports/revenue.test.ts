import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { payments } from "@/db/schema";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { invoiceInput } from "@/modules/invoices/schema";
import { createInvoice } from "@/modules/invoices/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { listPayments } from "@/modules/payments/queries";
import { paymentInput } from "@/modules/payments/schema";
import { allocatePayment, recordPayment } from "@/modules/payments/service";
import { periodRange } from "@/modules/revenue/period";
import { revenueSummary } from "@/modules/revenue/queries";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  revenueByClient,
  revenueByMonth,
  revenueByService,
  serviceRows,
  timeToPayment,
  timeToPaymentRows,
  unallocatedRows,
} from "./revenue";

const TODAY = "2026-10-27";
const OCTOBER = periodRange("this-month", TODAY);
const BASE = { baseCurrency: "INR" };

describe("money reports", () => {
  let ownerId: string;
  let maple: string;
  let priya: string;
  const ids: Record<string, string> = {};

  const invoice = async (lines: [string, string][], change: Record<string, string> = {}) => {
    const created = await createInvoice(
      ownerId,
      invoiceInput.parse({
        number: `INV-${crypto.randomUUID().slice(0, 8)}`,
        client: `organization:${maple}`,
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        currency: "INR",
        notes: "",
        status: "issued",
        lines: JSON.stringify(
          lines.map(([category, unitPrice]) => ({
            description: category || "Work",
            quantity: "1",
            unitPrice,
            category,
          })),
        ),
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
        amount: "50,000",
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
  const towards = (invoiceId: string, amount: string) =>
    JSON.stringify([{ invoiceId, amount }]);

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

    // Design and hosting, paid half in September and half in October: paid in full on
    // 5 October, 34 days after it was issued.
    ids.website = await invoice(
      [
        ["Design", "60,000"],
        ["Hosting", "40,000"],
      ],
      { issueDate: "2026-09-01", dueDate: "2026-09-16" },
    );
    await pay({ receivedOn: "2026-09-10", allocations: towards(ids.website, "50,000") });
    await pay({ receivedOn: "2026-10-05", allocations: towards(ids.website, "50,000") });
    // Design in dollars, at a stored rate, paid in full ten days after issue.
    ids.dollars = await invoice([["Design", "1,000"]], {
      client: `contact:${priya}`,
      currency: "USD",
    });
    await pay({
      client: `contact:${priya}`,
      receivedOn: "2026-10-11",
      amount: "1,000",
      currency: "USD",
      rate: "83.25",
      allocations: towards(ids.dollars, "1,000"),
    });
    // Lines naming no service, paid in part.
    ids.partly = await invoice([["", "20,000"]], { issueDate: "2026-10-15" });
    await pay({ receivedOn: "2026-10-21", amount: "10,000", allocations: towards(ids.partly, "10,000") });
    // An advance, put towards nothing yet.
    ids.advance = await pay({ amount: "30,000" });
    // Euros with no rate, as one recorded before the base currency changed.
    const euros = await pay({ receivedOn: "2026-10-21", amount: "300", currency: "EUR", rate: "90" });
    await db.update(payments).set({ fxRateToBase: null }).where(eq(payments.id, euros));
  });

  it("adds up each month's money in rupees, from the first payment to today", async () => {
    const october = await revenueByMonth(ownerId, OCTOBER, { today: TODAY, ...BASE });
    const received = (await revenueSummary(ownerId, { range: OCTOBER, today: TODAY, ...BASE })).received;
    expect(october.total).toEqual(received);
    expect(october.months).toEqual([
      { month: "2026-10", from: "2026-10-01", to: "2026-10-31", ...received },
    ]);

    const year = await revenueByMonth(ownerId, periodRange("this-year", TODAY), { today: TODAY, ...BASE });
    expect(year.months.map(({ month, from, to, minor }) => [month, from, to, minor])).toEqual([
      ["2026-09", "2026-09-01", "2026-09-30", 5_000_000],
      ["2026-10", "2026-10-01", "2026-10-31", 17_325_000],
    ]);
    for (const month of year.months) {
      expect((await listPayments(ownerId, { from: month.from, to: month.to })).total).toBe(month.count);
    }
  });

  it("lists every month between payments, the empty ones as nothing, and clamps to the dates", async () => {
    const range = { from: "2026-08-15", to: "2026-10-12" };
    const { months } = await revenueByMonth(ownerId, range, { today: TODAY, ...BASE });
    expect(months.map(({ month, from, to, count }) => [month, from, to, count])).toEqual([
      ["2026-09", "2026-09-01", "2026-09-30", 1],
      ["2026-10", "2026-10-01", "2026-10-12", 2],
    ]);
    const gap = await revenueByMonth(ownerId, { from: "2026-09-01" }, { today: "2026-12-05", ...BASE });
    expect(gap.months.map(({ month, minor }) => [month, minor])).toEqual([
      ["2026-09", 5_000_000],
      ["2026-10", 17_325_000],
      ["2026-11", 0],
      ["2026-12", 0],
    ]);
    expect(
      (await revenueByMonth(ownerId, { to: "2026-08-31" }, { today: TODAY, ...BASE })).months,
    ).toEqual([]);
  });

  it("adds up each client's money, most first, matching the client's Payments list", async () => {
    const { rows, total } = await revenueByClient(ownerId, OCTOBER, BASE);
    expect(total).toBe(2);
    expect(rows).toEqual([
      {
        client: { organizationId: maple },
        name: "Maple Studio",
        minor: 9_000_000,
        count: 4,
        converted: [],
        unconverted: [{ currency: "EUR", minor: 30_000, count: 1 }],
      },
      {
        client: { contactId: priya },
        name: "Priya",
        minor: 8_325_000,
        count: 1,
        converted: [{ currency: "USD", minor: 100_000, count: 1 }],
        unconverted: [],
      },
    ]);
    expect((await listPayments(ownerId, { ...OCTOBER, organizationId: maple })).total).toBe(4);
    expect((await revenueByClient(ownerId, OCTOBER, { ...BASE, limit: 1, offset: 1 })).rows[0].name).toBe(
      "Priya",
    );
  });

  it("splits a payment across its invoice's services by their amounts", async () => {
    const { services, unallocated } = await revenueByService(ownerId, OCTOBER, BASE);
    expect(services).toEqual([
      {
        service: "Design",
        minor: 3_000_000 + 8_325_000,
        count: 2,
        converted: [{ currency: "USD", minor: 100_000, count: 1 }],
        unconverted: [],
      },
      { service: "Hosting", minor: 2_000_000, count: 1, converted: [], unconverted: [] },
      { service: null, minor: 1_000_000, count: 1, converted: [], unconverted: [] },
    ]);
    expect(unallocated).toEqual({
      minor: 3_000_000,
      count: 2,
      converted: [],
      unconverted: [{ currency: "EUR", minor: 30_000, count: 1 }],
    });
    const received = (await revenueSummary(ownerId, { range: OCTOBER, today: TODAY, ...BASE })).received;
    expect(services.reduce((sum, row) => sum + row.minor, unallocated.minor)).toBe(received.minor);
  });

  it("lists the shares behind one service, and the payments holding money not yet put towards an invoice", async () => {
    const design = await serviceRows(ownerId, OCTOBER, "Design");
    expect(design.total).toBe(2);
    expect(design.rows.map(({ invoiceId, receivedOn, currency, minor, clientName }) => [
      invoiceId,
      receivedOn,
      currency,
      minor,
      clientName,
    ])).toEqual([
      [ids.dollars, "2026-10-11", "USD", 100_000, "Priya"],
      [ids.website, "2026-10-05", "INR", 3_000_000, "Maple Studio"],
    ]);
    expect((await serviceRows(ownerId, OCTOBER, null)).rows.map((row) => row.invoiceId)).toEqual([ids.partly]);
    expect((await serviceRows(ownerId, OCTOBER, "Copywriting")).total).toBe(0);

    const left = await unallocatedRows(ownerId, OCTOBER);
    expect(left.total).toBe(2);
    expect(left.rows.map((row) => [row.currency, row.leftover])).toEqual([
      ["EUR", 30_000],
      ["INR", 3_000_000],
    ]);
    expect(left.rows[1].id).toBe(ids.advance);
  });

  it("averages the days from issue to paid in full, leaving out invoices still owing", async () => {
    expect(await timeToPayment(ownerId, OCTOBER, TODAY)).toEqual({ count: 2, days: 22 });
    const rows = await timeToPaymentRows(ownerId, OCTOBER, TODAY);
    expect(rows.total).toBe(2);
    expect(rows.rows.map(({ id, issueDate, paidOn, days }) => [id, issueDate, paidOn, days])).toEqual([
      [ids.dollars, "2026-10-01", "2026-10-11", 10],
      [ids.website, "2026-09-01", "2026-10-05", 34],
    ]);
    expect(await timeToPayment(ownerId, periodRange("last-month", TODAY), TODAY)).toEqual({
      count: 0,
      days: null,
    });
  });

  it("counts an advance as paid on the day the invoice was issued", async () => {
    const later = await invoice([["Design", "30,000"]], { issueDate: "2026-10-25" });
    const result = await allocatePayment(ownerId, ids.advance, [{ invoiceId: later, amountMinor: 3_000_000 }]);
    expect(result.ok).toBe(true);
    const rows = await timeToPaymentRows(ownerId, OCTOBER, TODAY);
    expect(rows.rows[0]).toMatchObject({ id: later, paidOn: "2026-10-25", days: 0 });
    expect(await timeToPayment(ownerId, OCTOBER, TODAY)).toEqual({ count: 3, days: 15 });
  });

  it("shows another owner nothing", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    expect(await revenueByMonth(stranger, {}, { today: TODAY, ...BASE })).toEqual({
      total: { minor: 0, count: 0, converted: [], unconverted: [] },
      months: [],
    });
    expect(await revenueByClient(stranger, {}, BASE)).toEqual({ rows: [], total: 0 });
    expect(await revenueByService(stranger, {}, BASE)).toEqual({
      services: [],
      unallocated: { minor: 0, count: 0, converted: [], unconverted: [] },
    });
    expect(await serviceRows(stranger, {}, "Design")).toEqual({ rows: [], total: 0 });
    expect(await unallocatedRows(stranger, {})).toEqual({ rows: [], total: 0 });
    expect(await timeToPayment(stranger, {}, TODAY)).toEqual({ count: 0, days: null });
  });
});
