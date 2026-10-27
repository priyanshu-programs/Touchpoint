import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { minorToInput } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import { getInvoice } from "@/modules/invoices/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import { invoiceHref } from "../../invoices/labels";
import { PaymentForm } from "../payment-form";

export const metadata: Metadata = { title: "Record payment" };

const from = z.object({
  invoice: z.uuid().optional().catch(undefined),
  company: z.uuid().optional().catch(undefined),
  person: z.uuid().optional().catch(undefined),
});

type Filled = {
  client: string;
  clientName: string;
  currency?: string;
  amount?: string;
  invoiceId?: string;
};

// Opened from an invoice, its client, currency and what it still owes are filled in;
// from a company's or a person's tab, the client. Each only once found to be the owner's.
async function filledIn(
  ownerId: string,
  { invoice, company, person }: z.infer<typeof from>,
): Promise<Filled | null> {
  if (invoice) {
    const found = await getInvoice(ownerId, invoice);
    if (found && found.status === "issued" && found.balance > 0) {
      return {
        client: found.organizationId
          ? `organization:${found.organizationId}`
          : `contact:${found.contactId}`,
        clientName: found.clientName,
        currency: found.currency,
        amount: minorToInput(found.balance, found.currency),
        invoiceId: found.id,
      };
    }
  }
  if (company) {
    const organization = await getOrganization(ownerId, company);
    if (organization) return { client: `organization:${company}`, clientName: organization.name };
  }
  if (person) {
    const contact = await getContact(ownerId, person);
    if (contact) return { client: `contact:${person}`, clientName: contact.fullName };
  }
  return null;
}

export default async function NewPaymentPage({
  searchParams,
}: PageProps<"/money/payments/new">) {
  const owner = await requireOwner();
  const [settings, filled] = await Promise.all([
    getSettings(owner.id),
    filledIn(owner.id, from.parse(await searchParams)),
  ]);
  const baseCurrency = settings?.baseCurrency ?? "INR";
  const invoiceId = filled?.invoiceId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Record payment</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PaymentForm
          initial={{
            client: filled?.client ?? "",
            clientName: filled?.clientName ?? "",
            receivedOn: dateIn(settings?.timezone ?? "UTC"),
            amount: filled?.amount ?? "",
            currency: filled?.currency ?? baseCurrency,
            rate: "",
            method: "bank_transfer",
            reference: "",
            notes: "",
            // Made once per form shown, so sending it twice records one payment.
            idempotencyKey: randomUUID(),
            allocations: "",
          }}
          currencies={CURRENCIES}
          baseCurrency={baseCurrency}
          fromInvoice={invoiceId}
          cancelHref={invoiceId ? invoiceHref(invoiceId) : "/money/payments"}
        />
      </CardContent>
    </Card>
  );
}
