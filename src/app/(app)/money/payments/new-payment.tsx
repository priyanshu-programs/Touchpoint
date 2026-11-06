import { randomUUID } from "node:crypto";
import { minorToInput } from "@/lib/money";
import { dateIn } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import { getInvoice } from "@/modules/invoices/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import type { PanelOrigin } from "../panel-origin";
import { PaymentForm } from "./payment-form";

type Filled = {
  client: string;
  clientName: string;
  currency?: string;
  amount?: string;
  invoiceId?: string;
};

// Opened from an invoice, its client, currency and what it still owes are filled in;
// from a company's or a person's tab, the client. Each only once found to be the owner's.
export async function filledIn(
  ownerId: string,
  { invoice, company, person }: { invoice?: string; company?: string; person?: string },
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

// The form that records a payment, on its own page or in the panel of the record that
// paid, with what it was opened from filled in.
export async function NewPayment({
  ownerId,
  filled,
  cancelHref,
  origin,
}: {
  ownerId: string;
  filled: Filled | null;
  cancelHref: string;
  origin?: PanelOrigin;
}) {
  const settings = await getSettings(ownerId);
  const baseCurrency = settings?.baseCurrency ?? "INR";

  return (
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
      fromInvoice={filled?.invoiceId}
      cancelHref={cancelHref}
      origin={origin}
    />
  );
}
