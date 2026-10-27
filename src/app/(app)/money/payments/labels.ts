import {
  MAX_PAYMENTS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentListParams,
} from "@/modules/payments/schema";

export const paymentHref = (id: string) => `/money/payments/${id}`;

// A payment recorded from an invoice, or from a company's or person's tab, comes with
// them filled in.
export function newPaymentHref(
  from?: { invoice: string } | { organizationId: string } | { contactId: string },
) {
  if (!from) return "/money/payments/new";
  if ("invoice" in from) return `/money/payments/new?invoice=${from.invoice}`;
  return "organizationId" in from
    ? `/money/payments/new?company=${from.organizationId}`
    : `/money/payments/new?person=${from.contactId}`;
}

export function paymentsHref(
  params: PaymentListParams,
  change: Partial<PaymentListParams> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...change })) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `/money/payments${query ? `?${query}` : ""}`;
}

export const methodOptions = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

// Why a payment was not recorded, or not put towards an invoice, as the form says it.
export const PAYMENT_REFUSALS = {
  limit: `You have ${MAX_PAYMENTS} payments, the most there can be.`,
  unknown_client: "Choose who paid you from the list.",
  future: "The date the money arrived cannot be after today.",
  no_rate:
    "This payment is not in your base currency, so enter what one unit of it was worth in your base currency.",
  invoice:
    "One of the invoices can no longer take this payment: it must be issued, for this client and in this currency. Reload the page to see what is open.",
  over_balance: "That is more than an invoice still owes. Lower the amount for it.",
  over_amount: "The amounts for the invoices come to more than the payment has left.",
} as const;
