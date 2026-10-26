import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { addDays, dateIn } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import { serviceCategories } from "@/modules/invoices/queries";
import { DEFAULT_TERMS_DAYS } from "@/modules/invoices/schema";
import { getOrganization } from "@/modules/organizations/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import { createInvoiceAction } from "../actions";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "New invoice" };

const from = z.object({
  company: z.uuid().optional().catch(undefined),
  person: z.uuid().optional().catch(undefined),
});

// Opened from a company's or a person's Money tab, the client is filled in, once
// the record is found to be the owner's.
async function clientOf(ownerId: string, { company, person }: z.infer<typeof from>) {
  if (company) {
    const organization = await getOrganization(ownerId, company);
    if (organization) return { id: `organization:${company}`, label: organization.name };
  }
  if (person) {
    const contact = await getContact(ownerId, person);
    if (contact) return { id: `contact:${person}`, label: contact.fullName };
  }
  return null;
}

export default async function NewInvoicePage({
  searchParams,
}: PageProps<"/money/invoices/new">) {
  const owner = await requireOwner();
  const [settings, categories, client] = await Promise.all([
    getSettings(owner.id),
    serviceCategories(owner.id),
    clientOf(owner.id, from.parse(await searchParams)),
  ]);
  const today = dateIn(settings?.timezone ?? "UTC");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New invoice</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          cancelHref="/money/invoices"
        />
      </CardContent>
    </Card>
  );
}
