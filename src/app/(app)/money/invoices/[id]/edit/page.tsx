import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getInvoice } from "@/modules/invoices/queries";
import { EditInvoice, isEditable } from "../../invoice-editors";
import { invoiceHref } from "../../labels";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({
  params,
}: PageProps<"/money/invoices/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const invoice = await getInvoice(owner.id, id.data);
  if (!invoice || !isEditable(invoice)) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit invoice {invoice.number}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EditInvoice ownerId={owner.id} invoice={invoice} cancelHref={invoiceHref(invoice.id)} />
      </CardContent>
    </Card>
  );
}
