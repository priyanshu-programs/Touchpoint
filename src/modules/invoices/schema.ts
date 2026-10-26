import { z } from "zod";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { lineAmount, toHundredths, toMinor } from "@/lib/money";
import { CURRENCIES } from "@/modules/settings/schema";

export { INVOICE_STATUSES };

export const MAX_INVOICES = 5000;
export const MAX_INVOICE_LINES = 100;
export const MAX_INVOICE_ADJUSTMENTS = 20;
export const INVOICE_UPLOADS_PER_MINUTE = 30;
export const MAX_FILE_NAME = 200;
// The days from issue to due that a new invoice starts with.
export const DEFAULT_TERMS_DAYS = 15;
// What the exported invoice may be: what Figma exports.
export const INVOICE_FILE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  void: "Void",
};

// A client is named by kind and id together, so one field can hold either.
const client = z.string().transform((value, ctx) => {
  const [kind, id, ...rest] = value.split(":");
  if (rest.length === 0 && z.uuid().safeParse(id).success) {
    if (kind === "organization") return { organizationId: id, contactId: null };
    if (kind === "contact") return { organizationId: null, contactId: id };
  }
  ctx.addIssue({ code: "custom", message: "Choose who the invoice is for" });
  return z.NEVER;
});

// The form's lines and adjustments arrive as one JSON field each.
const json = z.string().max(200_000).transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "The invoice's lines could not be read" });
    return z.NEVER;
  }
});

const lineInput = z.strictObject({
  description: z
    .string()
    .trim()
    .min(1, "Describe each line, such as Website design")
    .max(200, "A line's description can be at most 200 characters"),
  quantity: z.string().max(20),
  unitPrice: z.string().max(30),
  category: text(60),
});

const adjustmentInput = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1, "Give each adjustment a reason, such as Discount")
    .max(200, "An adjustment's reason can be at most 200 characters"),
  amount: z.string().max(30),
});

const isoDate = (message: string) => z.iso.date(message);

export const invoiceInput = z
  .strictObject({
    number: z
      .string()
      .trim()
      .min(1, "Enter the invoice's number, as it is on the invoice")
      .max(60, "An invoice number can be at most 60 characters"),
    client,
    issueDate: isoDate("Enter the date it was issued"),
    dueDate: isoDate("Enter the date it is due"),
    currency: z.string().refine((value) => CURRENCIES.includes(value), {
      message: "Choose a currency from the list",
    }),
    notes: blankToNull(text(2000)),
    status: z.enum(["draft", "issued"]),
    lines: json.pipe(
      z
        .array(lineInput)
        .min(1, "An invoice has at least one line")
        .max(MAX_INVOICE_LINES, `An invoice holds at most ${MAX_INVOICE_LINES} lines`),
    ),
    adjustments: json.pipe(
      z
        .array(adjustmentInput)
        .max(
          MAX_INVOICE_ADJUSTMENTS,
          `An invoice holds at most ${MAX_INVOICE_ADJUSTMENTS} adjustments`,
        ),
    ),
  })
  // Amounts are read in the invoice's own currency, so a yen line takes no decimals.
  .transform(({ client, lines, adjustments, ...input }, ctx) => {
    if (input.dueDate < input.issueDate) {
      ctx.addIssue({ code: "custom", message: "The due date cannot be before the issue date" });
      return z.NEVER;
    }
    const read = lines.map((line) => {
      const hundredths = toHundredths(line.quantity);
      const unit = toMinor(line.unitPrice, input.currency);
      const amount =
        hundredths === null || unit === null ? null : lineAmount(hundredths, unit);
      return { line, hundredths, unit, amount };
    });
    const badQuantity = read.find(({ hundredths }) => hundredths === null);
    if (badQuantity) {
      ctx.addIssue({
        code: "custom",
        message: `Enter a quantity above 0 with at most two decimals for "${badQuantity.line.description}"`,
      });
      return z.NEVER;
    }
    const badPrice = read.find(({ unit, amount }) => unit === null || amount === null);
    if (badPrice) {
      ctx.addIssue({
        code: "custom",
        message: `Enter a price in ${input.currency} for "${badPrice.line.description}", such as 25000`,
      });
      return z.NEVER;
    }
    const taken = adjustments.map((adjustment) => ({
      adjustment,
      amount: toMinor(adjustment.amount, input.currency),
    }));
    const badAdjustment = taken.find(({ amount }) => !amount);
    if (badAdjustment) {
      ctx.addIssue({
        code: "custom",
        message: `Enter an amount above 0 in ${input.currency} for "${badAdjustment.adjustment.reason}"`,
      });
      return z.NEVER;
    }
    const subtotal = read.reduce((sum, { amount }) => sum + amount!, 0);
    const off = taken.reduce((sum, { amount }) => sum + amount!, 0);
    if (!Number.isSafeInteger(subtotal) || off > subtotal) {
      ctx.addIssue({
        code: "custom",
        message: Number.isSafeInteger(subtotal)
          ? "The adjustments come to more than the lines"
          : "The lines come to more than an invoice can hold",
      });
      return z.NEVER;
    }

    return {
      ...input,
      ...client,
      lines: read.map(({ line, hundredths, unit, amount }) => ({
        description: line.description,
        quantity: (hundredths! / 100).toFixed(2),
        unitAmountMinor: unit!,
        amountMinor: amount!,
        serviceCategory: line.category || null,
      })),
      adjustments: taken.map(({ adjustment, amount }) => ({
        reason: adjustment.reason,
        amountMinor: amount!,
      })),
    };
  });
export type InvoiceInput = z.output<typeof invoiceInput>;

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const INVOICE_SORTS = ["number", "issued", "due", "total"] as const;
export type InvoiceSort = (typeof INVOICE_SORTS)[number];

// What `/money/invoices` is narrowed and ordered by, read from its address.
export const invoiceListParams = z.object({
  q: optional(z.string().trim().max(100)),
  status: optional(z.enum(INVOICE_STATUSES)),
  currency: optional(z.string().regex(/^[A-Z]{3}$/)),
  company: optional(z.uuid()),
  person: optional(z.uuid()),
  sort: optional(z.enum(INVOICE_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(1000)),
});
export type InvoiceListParams = z.infer<typeof invoiceListParams>;
