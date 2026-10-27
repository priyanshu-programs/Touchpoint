import { MAX_INVOICES, type InvoiceListParams } from "@/modules/invoices/schema";
import { INVOICE_STATE_LABELS, INVOICE_STATES } from "@/modules/invoices/state";

export const invoiceHref = (id: string) => `/money/invoices/${id}`;

// A new invoice for a company or a person comes with them filled in.
export const newInvoiceHref = (client?: { organizationId: string } | { contactId: string }) =>
  !client
    ? "/money/invoices/new"
    : "organizationId" in client
      ? `/money/invoices/new?company=${client.organizationId}`
      : `/money/invoices/new?person=${client.contactId}`;

export function invoicesHref(
  params: InvoiceListParams,
  change: Partial<InvoiceListParams> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...change })) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `/money/invoices${query ? `?${query}` : ""}`;
}

export const invoiceStateOptions = INVOICE_STATES.map((value) => ({
  value,
  label: INVOICE_STATE_LABELS[value],
}));

// What the file pickers offer; a convenience, since the server reads the kind
// from the file itself.
export const INVOICE_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg";
export const INVOICE_FILE_HINT = "The PDF or picture you exported, up to 4 MB";

// Why an invoice was not saved, as its form says it.
export const INVOICE_REFUSALS = {
  number_taken: "You already have an invoice with that number. Check the number on the invoice.",
  limit: `You have ${MAX_INVOICES} invoices, the most there can be.`,
  unknown_client: "Choose who the invoice is for from the list.",
  void: "This invoice is void, so it stays as it was.",
  issued: "This invoice has been issued, so it cannot go back to being a draft.",
  paid: "This invoice has payments, so it stays as it is. Delete its payments first to change it.",
} as const;

// Why a file was not attached.
export const FILE_REFUSALS = {
  too_large: "That file is larger than 4 MB.",
  kind: "Only a PDF, PNG or JPEG is kept: export the invoice from Figma as one of those.",
  full: "Your 200 MB of file storage is used up. Remove a file you no longer need first.",
  rate: "Too many uploads in a minute. Try again shortly.",
} as const;

const counted = (count: number, one: string) =>
  count === 1 ? `1 ${one}` : `${count} ${one}s`;

// Said in place of the delete confirmation for a company or person with invoices or payments.
export function invoicedBlock(name: string, { invoices, payments }: { invoices: number; payments: number }) {
  const held = [
    invoices > 0 ? counted(invoices, "invoice") : null,
    payments > 0 ? counted(payments, "payment") : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    title: `${name} cannot be deleted`,
    description: `${name} has ${held}. These are kept as records, so archive ${name} instead, or delete ${payments > 0 ? "the payments and " : ""}any draft or void invoices first.`,
  };
}
