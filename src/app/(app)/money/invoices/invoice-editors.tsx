import { minorToInput } from "@/lib/money";
import { addDays, dateIn } from "@/lib/time";
import { serviceCategories, type Invoice } from "@/modules/invoices/queries";
import { DEFAULT_TERMS_DAYS } from "@/modules/invoices/schema";
import { CURRENCIES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import type { PanelOrigin } from "../panel-origin";
import { createInvoiceAction, updateInvoiceAction } from "./actions";
import { InvoiceForm } from "./invoice-form";

// A quantity is stored with two decimals and shown as it would be typed.
const quantityInput = (quantity: string) => String(Number(quantity));

// The form for a new invoice, on its own page or in the panel of the record it bills,
// with that client filled in when there is one.
export async function NewInvoice({
  ownerId,
  client,
  cancelHref,
  savedHref,
  origin,
}: {
  ownerId: string;
  client: { id: string; label: string } | null;
  cancelHref: string;
  savedHref?: string;
  origin?: PanelOrigin;
}) {
  const [settings, categories] = await Promise.all([
    getSettings(ownerId),
    serviceCategories(ownerId),
  ]);
  const today = dateIn(settings?.timezone ?? "UTC");

  return (
    <InvoiceForm
      action={createInvoiceAction}
      initial={{
        number: "",
        client: client?.id ?? "",
        clientName: client?.label ?? "",
        issueDate: today,
        dueDate: addDays(today, DEFAULT_TERMS_DAYS),
        currency: settings?.baseCurrency ?? "INR",
        notes: "",
        lines: "",
        adjustments: "",
      }}
      currencies={CURRENCIES}
      categories={categories}
      withFile
      cancelHref={cancelHref}
      savedHref={savedHref}
      origin={origin}
    />
  );
}

// An invoice's form, filled in from it. A void or paid invoice is not given one.
export async function EditInvoice({
  ownerId,
  invoice,
  cancelHref,
  origin,
}: {
  ownerId: string;
  invoice: Invoice;
  cancelHref: string;
  origin?: PanelOrigin;
}) {
  const categories = await serviceCategories(ownerId);
  const { currency } = invoice;

  return (
    <InvoiceForm
      action={updateInvoiceAction.bind(null, invoice.id)}
      initial={{
        number: invoice.number,
        client: invoice.organizationId
          ? `organization:${invoice.organizationId}`
          : `contact:${invoice.contactId}`,
        clientName: invoice.clientName,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        currency,
        notes: invoice.notes ?? "",
        lines: JSON.stringify(
          invoice.lines.map((line) => ({
            description: line.description,
            quantity: quantityInput(line.quantity),
            unitPrice: minorToInput(line.unitAmountMinor, currency),
            category: line.serviceCategory ?? "",
          })),
        ),
        adjustments: JSON.stringify(
          invoice.adjustments.map((adjustment) => ({
            reason: adjustment.reason,
            amount: minorToInput(adjustment.amountMinor, currency),
          })),
        ),
      }}
      currencies={CURRENCIES}
      categories={categories}
      issued={invoice.status === "issued"}
      cancelHref={cancelHref}
      origin={origin}
    />
  );
}

// Whether an invoice can still be edited: a void one stays as it was voided, and a
// paid one as it was paid.
export const isEditable = (invoice: Invoice) =>
  invoice.status !== "void" && invoice.allocations.length === 0;
