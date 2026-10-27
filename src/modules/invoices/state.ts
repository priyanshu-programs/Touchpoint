import type { InvoiceStatus } from "@/db/schema";

// Where an invoice stands, worked out from its status, what has been paid towards
// it and its due date. Never stored: a payment or the date moving on changes it.
export const INVOICE_STATES = ["draft", "unpaid", "partly_paid", "overdue", "paid", "void"] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  partly_paid: "Partly paid",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

// An issued invoice still owing past its due date is overdue, paid in part or not;
// `today` is the owner's date, as YYYY-MM-DD.
export function invoiceState(
  { status, paid, balance, dueDate }: { status: InvoiceStatus; paid: number; balance: number; dueDate: string },
  today: string,
): InvoiceState {
  if (status !== "issued") return status;
  if (balance <= 0) return "paid";
  if (dueDate < today) return "overdue";
  return paid > 0 ? "partly_paid" : "unpaid";
}
