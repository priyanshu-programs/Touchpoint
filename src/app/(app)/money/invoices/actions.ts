"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { listContacts } from "@/modules/contacts/queries";
import { invoiceInput } from "@/modules/invoices/schema";
import {
  createInvoice,
  deleteInvoice,
  issueInvoice,
  removeInvoiceFile,
  updateInvoice,
  voidInvoice,
  type InvoiceResult,
} from "@/modules/invoices/service";
import { listOrganizations } from "@/modules/organizations/queries";
import { INVOICE_REFUSALS, invoiceHref } from "./labels";

// The id comes back, instead of a redirect, when the browser still has the file to send.
export type InvoiceFormState = (RecordFormState & { id?: string }) | null;

const FIELDS = [
  "number",
  "client",
  "issueDate",
  "dueDate",
  "currency",
  "notes",
  "lines",
  "adjustments",
] as const;

function refresh() {
  revalidatePath("/money", "layout");
  // A company's and a person's Invoices tab, and whether they can be deleted.
  revalidatePath("/people", "layout");
}

// The client's name is only echoed back, so a refused form shows the choice again.
function read(formData: FormData) {
  const fields = readFields(formData, FIELDS);
  const status = formData.get("status");
  return {
    values: { ...fields, ...readFields(formData, ["clientName"]) },
    parsed: invoiceInput.safeParse({ ...fields, status }),
  };
}

function failure(
  result: Exclude<InvoiceResult, { ok: true }>,
  values: Record<string, string>,
): InvoiceFormState {
  if (result.reason === "not_found") notFound();
  return { ok: false, message: INVOICE_REFUSALS[result.reason], values };
}

export async function createInvoiceAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const owner = await requireOwner();
  const { values, parsed } = read(formData);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createInvoice(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  if (formData.get("withFile") === "1") return { ok: true, message: "", id: result.id };
  redirect(invoiceHref(result.id));
}

export async function updateInvoiceAction(
  id: string,
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const owner = await requireOwner();
  const invoiceId = z.uuid().parse(id);
  const { values, parsed } = read(formData);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateInvoice(owner.id, invoiceId, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  redirect(invoiceHref(invoiceId));
}

// The menu offers each only where it applies, so a refusal was not asked for from the page.
async function change(
  formData: FormData,
  run: (ownerId: string, id: string) => Promise<{ ok: boolean; reason?: string }>,
) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  const result = await run(owner.id, id);
  if (!result.ok && result.reason === "not_found") notFound();
  refresh();
  return id;
}

export async function issueInvoiceAction(formData: FormData) {
  await change(formData, issueInvoice);
}

export async function voidInvoiceAction(formData: FormData) {
  await change(formData, voidInvoice);
}

export async function deleteInvoiceAction(formData: FormData) {
  await change(formData, deleteInvoice);
  redirect("/money/invoices");
}

export async function removeInvoiceFileAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await removeInvoiceFile(owner.id, id))) notFound();
  refresh();
}

// Who an invoice can bill: the owner's companies and people, named by kind and id.
export async function searchClientsAction(query: string) {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const [companies, people] = await Promise.all([
    listOrganizations(owner.id, { q, limit: 10 }),
    listContacts(owner.id, { q, limit: 10 }),
  ]);
  return [
    ...companies.rows.map((row) => ({
      id: `organization:${row.id}`,
      label: row.name,
      hint: "Company",
    })),
    ...people.rows.map((row) => ({
      id: `contact:${row.id}`,
      label: row.fullName,
      hint: row.companies.map((company) => company.name).join(", ") || "Person",
    })),
  ];
}
