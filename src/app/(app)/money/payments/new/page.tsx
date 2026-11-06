import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { invoiceHref } from "../../invoices/labels";
import { filledIn, NewPayment } from "../new-payment";

export const metadata: Metadata = { title: "Record payment" };

const from = z.object({
  invoice: z.uuid().optional().catch(undefined),
  company: z.uuid().optional().catch(undefined),
  person: z.uuid().optional().catch(undefined),
});

export default async function NewPaymentPage({
  searchParams,
}: PageProps<"/money/payments/new">) {
  const owner = await requireOwner();
  const filled = await filledIn(owner.id, from.parse(await searchParams));
  const invoiceId = filled?.invoiceId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Record payment</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewPayment
          ownerId={owner.id}
          filled={filled}
          cancelHref={invoiceId ? invoiceHref(invoiceId) : "/money/payments"}
        />
      </CardContent>
    </Card>
  );
}
