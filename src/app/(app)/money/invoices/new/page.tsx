import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getContact } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { NewInvoice } from "../invoice-editors";

export const metadata: Metadata = { title: "New invoice" };

const from = z.object({
  company: z.uuid().optional().catch(undefined),
  person: z.uuid().optional().catch(undefined),
});

// Opened with a company or a person, the client is filled in, once the record is found
// to be the owner's.
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
  const client = await clientOf(owner.id, from.parse(await searchParams));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New invoice</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewInvoice ownerId={owner.id} client={client} cancelHref="/money/invoices" />
      </CardContent>
    </Card>
  );
}
