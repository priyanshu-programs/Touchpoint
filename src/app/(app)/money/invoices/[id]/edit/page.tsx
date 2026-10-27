import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { minorToInput } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getInvoice, serviceCategories } from "@/modules/invoices/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { updateInvoiceAction } from "../../actions";
import { InvoiceForm } from "../../invoice-form";
import { invoiceHref } from "../../labels";

export const metadata: Metadata = { title: "Edit invoice" };

// A quantity is stored with two decimals and shown as it would be typed.
const quantityInput = (quantity: string) => String(Number(quantity));

export default async function EditInvoicePage({
  params,
}: PageProps<"/money/invoices/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [invoice, categories] = await Promise.all([
    getInvoice(owner.id, id.data),
    serviceCategories(owner.id),
  ]);
  // A void invoice stays as it was voided, and a paid one as it was paid.
  if (!invoice || invoice.status === "void" || invoice.allocations.length > 0) notFound();
  const { currency } = invoice;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit invoice {invoice.number}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          cancelHref={invoiceHref(invoice.id)}
        />
      </CardContent>
    </Card>
  );
}
