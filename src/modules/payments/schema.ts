import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { toMinor, toRate } from "@/lib/money";
import { clientField } from "@/modules/invoices/schema";
import { CURRENCIES } from "@/modules/settings/schema";

export { PAYMENT_METHODS };

export const MAX_PAYMENTS = 10_000;
// How many invoices one payment can be put towards.
export const MAX_ALLOCATIONS = 50;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

const allocationInput = z.strictObject({
  invoiceId: z.uuid("Choose the invoices from the list"),
  amount: z.string().max(30),
});

// The amounts to put towards invoices arrive as one JSON field. A blank amount puts
// nothing towards that invoice.
const allocationsJson = z
  .string()
  .max(50_000)
  .transform((value, ctx) => {
    if (value.trim() === "") return [];
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "The amounts for each invoice could not be read" });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(allocationInput)
      .max(MAX_ALLOCATIONS, `A payment can go towards at most ${MAX_ALLOCATIONS} invoices`),
  );

export type Allocation = { invoiceId: string; amountMinor: number };

// Each amount read in the payment's currency, one invoice once; a blank or zero
// amount puts nothing towards that invoice.
export function readAllocations(
  allocations: z.infer<typeof allocationInput>[],
  currency: string,
): { allocations: Allocation[] } | { message: string } {
  const read: Allocation[] = [];
  for (const { invoiceId, amount } of allocations) {
    if (amount.trim() === "") continue;
    const amountMinor = toMinor(amount, currency);
    if (amountMinor === null) {
      return { message: `Enter each amount in ${currency}, such as 25000` };
    }
    if (amountMinor === 0) continue;
    if (read.some((other) => other.invoiceId === invoiceId)) {
      return { message: "Each invoice can be chosen once" };
    }
    read.push({ invoiceId, amountMinor });
  }
  return { allocations: read };
}

export const paymentInput = z
  .strictObject({
    client: clientField("Choose who paid you"),
    receivedOn: z.iso.date("Enter the date the money arrived"),
    amount: z.string().max(30),
    currency: z.string().refine((value) => CURRENCIES.includes(value), {
      message: "Choose a currency from the list",
    }),
    rate: z.string().max(30),
    method: z.enum(PAYMENT_METHODS, "Choose how you were paid"),
    reference: blankToNull(
      text(100).max(100, "A reference can be at most 100 characters"),
    ),
    notes: blankToNull(text(2000)),
    idempotencyKey: z.uuid(),
    confirmDuplicate: z.enum(["yes", ""]).transform((value) => value === "yes"),
    allocations: allocationsJson,
  })
  // Amounts are read in the payment's own currency, as an invoice's are.
  .transform(({ client, amount, rate, allocations, ...input }, ctx) => {
    const amountMinor = toMinor(amount, input.currency);
    if (!amountMinor) {
      ctx.addIssue({
        code: "custom",
        message: `Enter the amount received in ${input.currency}, such as 25000`,
      });
      return z.NEVER;
    }
    const fxRateToBase = rate.trim() === "" ? null : toRate(rate);
    if (rate.trim() !== "" && fxRateToBase === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the rate as a number above 0 with at most eight decimals, such as 83.25",
      });
      return z.NEVER;
    }
    const result = readAllocations(allocations, input.currency);
    if ("message" in result) {
      ctx.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    const read = result.allocations;
    if (read.reduce((sum, { amountMinor }) => sum + amountMinor, 0) > amountMinor) {
      ctx.addIssue({
        code: "custom",
        message: "The amounts for the invoices come to more than the payment",
      });
      return z.NEVER;
    }
    return { ...input, ...client, amountMinor, fxRateToBase, allocations: read };
  });
export type PaymentInput = z.output<typeof paymentInput>;

// Putting what is left of a payment towards invoices; the currency comes from the
// payment as stored.
export const allocateInput = z.strictObject({
  paymentId: z.uuid(),
  allocations: allocationsJson,
});

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const PAYMENT_SORTS = ["received", "amount"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

// What `/money/payments` is narrowed and ordered by, read from its address.
export const paymentListParams = z.object({
  q: optional(z.string().trim().max(100)),
  currency: optional(z.string().regex(/^[A-Z]{3}$/)),
  company: optional(z.uuid()),
  person: optional(z.uuid()),
  sort: optional(z.enum(PAYMENT_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(1000)),
});
export type PaymentListParams = z.infer<typeof paymentListParams>;
