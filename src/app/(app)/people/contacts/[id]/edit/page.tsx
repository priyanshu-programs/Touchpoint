import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getContact } from "@/modules/contacts/queries";
import { updateContactAction } from "../../actions";
import { ContactForm } from "../../contact-form";
import { contactFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
}: PageProps<"/people/contacts/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const contact = await getContact(owner.id, id.data);
  if (!contact) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit {contact.fullName}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ContactForm
          action={updateContactAction.bind(null, contact.id)}
          initial={{
            firstName: contact.firstName,
            lastName: contact.lastName ?? "",
            phoneE164: contact.phoneE164 ?? "",
            organizationId: contact.organizationId ?? "",
            organizationName: contact.organizationName ?? "",
            jobTitle: contact.jobTitle ?? "",
            department: contact.department ?? "",
            relationshipType: contact.relationshipType,
            status: contact.status,
            preferredChannel: contact.preferredChannel ?? "",
            city: contact.city ?? "",
            region: contact.region ?? "",
            country: contact.country ?? "",
            timezone: contact.timezone ?? "",
            tags: contact.tags.join(", "),
          }}
          options={contactFormOptions(contact.timezone)}
          withEmail={false}
          submitLabel="Save changes"
          cancelHref={`/people/contacts/${contact.id}`}
        />
      </CardContent>
    </Card>
  );
}
