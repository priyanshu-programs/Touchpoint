import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { companyHref } from "../../labels";
import { getOrganization } from "@/modules/organizations/queries";
import { createContactAction } from "../actions";
import { ContactForm } from "../contact-form";
import { contactFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Add contact" };

export default async function NewContactPage({
  searchParams,
}: PageProps<"/people/contacts/new">) {
  const owner = await requireOwner();
  const organizationId = z.uuid().safeParse((await searchParams).organization);
  const organization = organizationId.success
    ? await getOrganization(owner.id, organizationId.data)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Add contact</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ContactForm
          action={createContactAction}
          initial={{
            firstName: "",
            lastName: "",
            email: "",
            phoneE164: "",
            organizationId: organization?.id ?? "",
            organizationName: organization?.name ?? "",
            jobTitle: "",
            department: "",
            relationshipType: "prospect",
            status: "active",
            preferredChannel: "",
            city: "",
            region: "",
            country: "",
            timezone: "",
            tags: "",
          }}
          options={contactFormOptions()}
          isNew
          submitLabel="Add contact"
          cancelHref={
            organization
              ? companyHref(organization.id, "contacts")
              : "/people/contacts"
          }
        />
      </CardContent>
    </Card>
  );
}
