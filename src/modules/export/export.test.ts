import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { auditLog, settings, tasks } from "@/db/schema";
import { brainstormElementsSave, brainstormName } from "@/modules/brainstorm/schema";
import { createBrainstorm, saveBrainstormElements } from "@/modules/brainstorm/service";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { invoiceInput } from "@/modules/invoices/schema";
import { createInvoice } from "@/modules/invoices/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { paymentInput } from "@/modules/payments/schema";
import { recordPayment } from "@/modules/payments/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { decimal } from "./sheets";
import { lastExport, MAX_EXPORTS_AN_HOUR, startExport } from "./service";
import { exportZip } from "./stream";

const company = (name: string, tags = "") =>
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
    status: "client",
    tags,
  });

async function unzip(ownerId: string) {
  const bytes = new Uint8Array(await new Response(exportZip(ownerId)).arrayBuffer());
  return unzipSync(bytes);
}

describe("data export", () => {
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    otherId = await createTestOwner("other@example.com");
    await db.insert(settings).values([
      { ownerId, baseCurrency: "INR", timezone: "Asia/Kolkata" },
      { ownerId: otherId, baseCurrency: "USD", timezone: "UTC" },
    ]);

    const maple = await createOrganization(ownerId, company("Maple Studio", "design"));
    const hidden = await createOrganization(otherId, company("Someone Else's Co"));
    if (!maple.ok || !hidden.ok) throw new Error("setup");
    const ada = await createContact(
      ownerId,
      newContactInput.parse({
        firstName: "Ada",
        lastName: "Fern",
        email: "ada@maple.test",
        organizationId: maple.id,
        // Typed into a field, it must reach a spreadsheet as text.
        jobTitle: "=1+1",
        department: "",
        phoneE164: "",
        city: "",
        region: "",
        country: "",
        timezone: "",
        preferredChannel: "",
        status: "active",
        relationshipType: "client",
        tags: "",
      }),
    );
    if (!ada.ok) throw new Error("setup");
    await db.insert(tasks).values({ ownerId, title: "Send the brief", organizationId: maple.id });

    const invoice = await createInvoice(
      ownerId,
      invoiceInput.parse({
        number: "INV-1",
        client: `organization:${maple.id}`,
        issueDate: "2026-10-01",
        dueDate: "2099-10-31",
        currency: "INR",
        notes: "",
        status: "issued",
        lines: JSON.stringify([
          { description: "Logo, round two", quantity: "1", unitPrice: "1,00,000", category: "Design" },
        ]),
        adjustments: "[]",
      }),
    );
    if (!invoice.ok) throw new Error(invoice.reason);
    const payment = await recordPayment(
      ownerId,
      paymentInput.parse({
        client: `organization:${maple.id}`,
        receivedOn: "2026-10-20",
        amount: "40,000",
        currency: "INR",
        rate: "",
        method: "upi",
        reference: "UTR-1",
        notes: "",
        idempotencyKey: crypto.randomUUID(),
        confirmDuplicate: "",
        allocations: JSON.stringify([{ invoiceId: invoice.id, amount: "30,000" }]),
      }),
    );
    if (!payment.ok) throw new Error(payment.reason);

    const board = await createBrainstorm(ownerId, brainstormName.parse({ name: "Ideas" }));
    if (!board.ok) throw new Error(board.reason);
    await saveBrainstormElements(
      ownerId,
      board.id,
      brainstormElementsSave.parse({
        since: 0,
        elements: [
          { id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1, versionNonce: 1, isDeleted: false },
        ],
      }),
    );
  });

  it("holds every record in data.json and in the spreadsheets, and nobody else's", async () => {
    const raw = await unzip(ownerId);
    // Decoding drops a byte order mark, so it is looked for in the bytes.
    for (const [name, content] of Object.entries(raw)) {
      if (name.endsWith(".csv")) expect([...content.slice(0, 3)], name).toEqual([0xef, 0xbb, 0xbf]);
    }
    const files = Object.fromEntries(
      Object.entries(raw).map(([name, content]) => [name, strFromU8(content)]),
    );
    expect(Object.keys(files).sort()).toEqual(
      [
        "README.txt",
        "data.json",
        ...[
          "activities", "brainstorm-boards", "companies", "files", "invoice-lines", "invoices",
          "material-sends", "materials", "payments", "people", "tasks", "workflows",
        ].map((name) => `csv/${name}.csv`),
      ].sort(),
    );

    const data = JSON.parse(files["data.json"]);
    expect(data).toMatchObject({
      format: "touchpoint-export",
      formatVersion: 1,
      timezone: "Asia/Kolkata",
      baseCurrency: "INR",
      owner: { name: "Test Owner", email: "owner@example.com" },
    });
    expect(data.tables.organizations.map((row: { name: string }) => row.name)).toEqual(["Maple Studio"]);
    expect(data.tables.contact_emails[0]).toMatchObject({ email: "ada@maple.test" });
    expect(data.tables.invoice_lines[0]).toMatchObject({ amountMinor: 10_000_000, quantity: "1.00" });
    expect(data.tables.payment_allocations[0]).toMatchObject({ amountMinor: 3_000_000 });
    expect(data.tables.brainstorm_elements[0]).toMatchObject({ elementId: "a", data: { type: "rectangle" } });
    expect(data.tables.audit_log.length).toBeGreaterThan(0);

    // Nothing that signs in, and no other owner's rows. Files' bytes are left out by
    // column type (tables.test.ts); a board's "bytes" is only its size.
    const json = files["data.json"];
    for (const key of ['"password"', '"token"', '"accessToken"', '"search"', '"rawResult"']) {
      expect(json).not.toContain(key);
    }
    expect(json).not.toContain(otherId);
    expect(json).not.toContain("Someone Else");
    expect(Object.values(files).join("")).not.toContain("Someone Else");

    const people = files["csv/people.csv"];
    expect(people.startsWith("First name,Last name,Title,")).toBe(true);
    expect(people).toContain("Ada,Fern,'=1+1,,ada@maple.test,,,Maple Studio,");
    expect(files["csv/companies.csv"]).toContain("Maple Studio,,,,,,,,,,Client,design,1,,");
    expect(files["csv/tasks.csv"]).toContain("Send the brief,Open,Normal,");
    expect(files["csv/invoices.csv"]).toContain(
      "INV-1,Maple Studio,2026-10-01,2099-10-31,INR,100000.00,30000.00,70000.00,Partly paid,,",
    );
    expect(files["csv/invoice-lines.csv"]).toContain(
      'INV-1,Line,"Logo, round two",Design,1.00,100000.00,100000.00,INR',
    );
    expect(files["csv/payments.csv"]).toContain(
      "2026-10-20,Maple Studio,40000.00,INR,,UPI,UTR-1,30000.00,10000.00,INV-1 (30000.00),",
    );
    expect(files["csv/brainstorm-boards.csv"]).toContain("Ideas,1,");
  });

  it("writes an amount in its currency's own digits", () => {
    expect(decimal(150_000, "INR")).toBe("1500.00");
    expect(decimal(7, "INR")).toBe("0.07");
    expect(decimal(1500, "JPY")).toBe("1500");
    expect(decimal(1_234_567, "KWD")).toBe("1234.567");
  });

  it("allows five exports an hour, each recorded", async () => {
    expect(await lastExport(ownerId)).toBeNull();
    for (let count = 0; count < MAX_EXPORTS_AN_HOUR; count++) {
      expect(await startExport(ownerId)).toEqual({ ok: true });
    }
    expect(await startExport(ownerId)).toEqual({ ok: false, reason: "rate" });
    expect(await startExport(otherId)).toEqual({ ok: true });
    const recorded = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "data.export"));
    expect(recorded.filter((row) => row.ownerId === ownerId)).toHaveLength(MAX_EXPORTS_AN_HOUR);
    expect(await lastExport(ownerId)).toBeInstanceOf(Date);
  });
});
