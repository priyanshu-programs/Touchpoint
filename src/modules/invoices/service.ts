import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  auditLog,
  contacts,
  invoiceAdjustments,
  invoiceLines,
  invoices,
  organizations,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { fileType } from "@/modules/files/sniff";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import {
  INVOICE_FILE_TYPES,
  INVOICE_UPLOADS_PER_MINUTE,
  MAX_FILE_NAME,
  MAX_INVOICES,
  type InvoiceInput,
} from "./schema";

export type InvoiceResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_found" | "number_taken" | "limit" | "unknown_client" | "void" | "issued";
    };

// Held to the end of the transaction, so the limit and the unique number cannot
// be passed by two changes at once.
const lockInvoices = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoices:${ownerId}`}))`);

async function lockInvoice(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.ownerId, ownerId), eq(invoices.id, id)))
    .for("update");
  return row;
}

// The number is citext, so this compares without regard to case.
async function numberTaken(tx: Tx, ownerId: string, number: string, except?: string) {
  const [row] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.ownerId, ownerId),
        eq(invoices.number, number),
        except ? ne(invoices.id, except) : undefined,
      ),
    );
  return Boolean(row);
}

// The client is held while the invoice is written, so it cannot be deleted under it.
async function clientIsOwners(
  tx: Tx,
  ownerId: string,
  { organizationId, contactId }: Pick<InvoiceInput, "organizationId" | "contactId">,
) {
  const [row] = organizationId
    ? await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, organizationId)))
        .for("share")
    : await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, contactId!)))
        .for("share");
  return Boolean(row);
}

// Lines and adjustments are replaced as a set, in the order they were given.
async function writeLines(tx: Tx, ownerId: string, invoiceId: string, input: InvoiceInput) {
  await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  await tx.delete(invoiceAdjustments).where(eq(invoiceAdjustments.invoiceId, invoiceId));
  await tx
    .insert(invoiceLines)
    .values(input.lines.map((line, position) => ({ ownerId, invoiceId, position, ...line })));
  if (input.adjustments.length > 0) {
    await tx.insert(invoiceAdjustments).values(
      input.adjustments.map((adjustment, position) => ({
        ownerId,
        invoiceId,
        position,
        ...adjustment,
      })),
    );
  }
}

const fields = (input: InvoiceInput) => ({
  number: input.number,
  organizationId: input.organizationId,
  contactId: input.contactId,
  issueDate: input.issueDate,
  dueDate: input.dueDate,
  currency: input.currency,
  status: input.status,
  notes: input.notes,
});

// What the audit log keeps of an invoice: everything but the file's bytes.
async function snapshot(tx: Tx, row: typeof invoices.$inferSelect) {
  const [lines, adjustments] = await Promise.all([
    tx
      .select({
        description: invoiceLines.description,
        quantity: invoiceLines.quantity,
        unitAmountMinor: invoiceLines.unitAmountMinor,
        amountMinor: invoiceLines.amountMinor,
        serviceCategory: invoiceLines.serviceCategory,
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, row.id))
      .orderBy(asc(invoiceLines.position)),
    tx
      .select({ reason: invoiceAdjustments.reason, amountMinor: invoiceAdjustments.amountMinor })
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.invoiceId, row.id))
      .orderBy(asc(invoiceAdjustments.position)),
  ]);
  return {
    number: row.number,
    organizationId: row.organizationId,
    contactId: row.contactId,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    fileName: row.fileName,
    lines,
    adjustments,
  };
}

const inputSnapshot = (input: InvoiceInput) => ({
  ...fields(input),
  lines: input.lines,
  adjustments: input.adjustments,
});

export async function createInvoice(
  ownerId: string,
  input: InvoiceInput,
): Promise<InvoiceResult> {
  return db.transaction(async (tx) => {
    await lockInvoices(tx, ownerId);
    const owned = await tx.$count(invoices, eq(invoices.ownerId, ownerId));
    if (owned >= MAX_INVOICES) return { ok: false, reason: "limit" };
    if (await numberTaken(tx, ownerId, input.number)) {
      return { ok: false, reason: "number_taken" };
    }
    if (!(await clientIsOwners(tx, ownerId, input))) {
      return { ok: false, reason: "unknown_client" };
    }

    const [row] = await tx
      .insert(invoices)
      .values({ ownerId, ...fields(input) })
      .returning({ id: invoices.id });
    await writeLines(tx, ownerId, row.id, input);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "invoice.create",
      entityType: "invoice",
      entityId: row.id,
      after: inputSnapshot(input),
    });
    return { ok: true, id: row.id };
  });
}

// A void invoice stays as it was voided, and an issued one is not taken back to a draft.
export async function updateInvoice(
  ownerId: string,
  id: string,
  input: InvoiceInput,
): Promise<InvoiceResult> {
  return db.transaction(async (tx) => {
    await lockInvoices(tx, ownerId);
    const before = await lockInvoice(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (before.status === "void") return { ok: false, reason: "void" };
    if (before.status === "issued" && input.status === "draft") {
      return { ok: false, reason: "issued" };
    }
    if (await numberTaken(tx, ownerId, input.number, id)) {
      return { ok: false, reason: "number_taken" };
    }
    if (!(await clientIsOwners(tx, ownerId, input))) {
      return { ok: false, reason: "unknown_client" };
    }

    const was = await snapshot(tx, before);
    await tx.update(invoices).set(fields(input)).where(eq(invoices.id, id));
    await writeLines(tx, ownerId, id, input);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "invoice.update",
      entityType: "invoice",
      entityId: id,
      before: was,
      after: inputSnapshot(input),
    });
    return { ok: true, id };
  });
}

export type StatusResult = { ok: true } | { ok: false; reason: "not_found" | "status" };

// A draft is issued, and an issued invoice voided; voiding cannot be undone.
async function moveStatus(
  ownerId: string,
  id: string,
  from: "draft" | "issued",
  to: "issued" | "void",
): Promise<StatusResult> {
  return db.transaction(async (tx) => {
    const before = await lockInvoice(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (before.status !== from) return { ok: false, reason: "status" };
    await tx.update(invoices).set({ status: to }).where(eq(invoices.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: to === "issued" ? "invoice.issue" : "invoice.void",
      entityType: "invoice",
      entityId: id,
      before: { number: before.number, status: from },
      after: { number: before.number, status: to },
    });
    return { ok: true };
  });
}

export const issueInvoice = (ownerId: string, id: string) =>
  moveStatus(ownerId, id, "draft", "issued");

export const voidInvoice = (ownerId: string, id: string) =>
  moveStatus(ownerId, id, "issued", "void");

// Only a draft is deleted; an issued invoice was sent, so it is voided instead.
export async function deleteInvoice(ownerId: string, id: string): Promise<StatusResult> {
  return db.transaction(async (tx) => {
    const before = await lockInvoice(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (before.status === "issued") return { ok: false, reason: "status" };
    const was = await snapshot(tx, before);
    await tx.delete(invoices).where(eq(invoices.id, id));
    if (before.fileId) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "invoice.delete",
      entityType: "invoice",
      entityId: id,
      before: was,
    });
    return { ok: true };
  });
}

export type UploadedFile = { name: string; bytes: Buffer };

export type FileResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "too_large" | "kind" | "full" | "rate" };

// A file goes by the name it was uploaded under, without what a name cannot hold.
const fileTitle = (name: string) =>
  name
    .replace(/[\p{Cc}\\/]+/gu, " ")
    .trim()
    .slice(0, MAX_FILE_NAME) || "Invoice";

// Uploads are counted from the audit log, where each stored file is recorded with its kind.
async function uploadsInLastMinute(tx: Tx, ownerId: string) {
  return tx.$count(
    auditLog,
    and(
      eq(auditLog.ownerId, ownerId),
      eq(auditLog.entityType, "invoice"),
      eq(auditLog.action, "invoice.file_attach"),
      gt(auditLog.createdAt, sql`now() - interval '1 minute'`),
    ),
  );
}

// The exported invoice: a PDF or a picture, told by its bytes alone. A file in
// place of another lets the old one go if nothing else points at it.
export async function attachInvoiceFile(
  ownerId: string,
  id: string,
  { name, bytes }: UploadedFile,
): Promise<FileResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = fileType(bytes);
  if (!contentType || !INVOICE_FILE_TYPES.has(contentType)) {
    return { ok: false, reason: "kind" };
  }

  return db.transaction(async (tx) => {
    const before = await lockInvoice(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if ((await uploadsInLastMinute(tx, ownerId)) >= INVOICE_UPLOADS_PER_MINUTE) {
      return { ok: false, reason: "rate" };
    }
    const fileId = await storeFile(tx, ownerId, bytes, contentType);
    if (!fileId) return { ok: false, reason: "full" };

    const fileName = fileTitle(name);
    await tx.update(invoices).set({ fileId, fileName }).where(eq(invoices.id, id));
    if (before.fileId && before.fileId !== fileId) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "invoice.file_attach",
      entityType: "invoice",
      entityId: id,
      before: { fileName: before.fileName },
      after: { fileName, contentType, size: bytes.length },
    });
    return { ok: true };
  });
}

export async function removeInvoiceFile(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockInvoice(tx, ownerId, id);
    if (!before) return false;
    if (!before.fileId) return true;
    await tx
      .update(invoices)
      .set({ fileId: null, fileName: null })
      .where(eq(invoices.id, id));
    await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "invoice.file_remove",
      entityType: "invoice",
      entityId: id,
      before: { fileName: before.fileName },
    });
    return true;
  });
}

export type ClientDeleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invoiced"; count: number };

// How many invoices bill a company or a person, which keeps it from being deleted.
export const invoicesBilling = (
  tx: Tx,
  client: { organizationId: string } | { contactId: string },
) =>
  tx.$count(
    invoices,
    "organizationId" in client
      ? eq(invoices.organizationId, client.organizationId)
      : eq(invoices.contactId, client.contactId),
  );
