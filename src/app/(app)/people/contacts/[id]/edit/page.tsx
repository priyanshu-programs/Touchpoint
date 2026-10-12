import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getContact } from "@/modules/contacts/queries";
import { listCustomFields } from "@/modules/fields/queries";
import {
  customFormFields,
  customFormValues,
} from "../../../fields/custom-values";
import { contactHref, contactPanelHref } from "../../../labels";
import { updateContactAction } from "../../actions";
import { ContactForm } from "../../contact-form";
import { contactFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
  searchParams,
}: PageProps<"/people/contacts/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [contact, customFields] = await Promise.all([
    getContact(owner.id, id.data),
    listCustomFields(owner.id, "contact"),
  ]);
  if (!contact) notFound();
  // The company whose panel the edit was opened from, to go back there afterwards.
  const company = z.uuid().safeParse((await searchParams).company);
  const companyId = company.success ? company.data : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit {contact.fullName}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ContactForm
          action={updateContactAction.bind(null, contact.id, companyId)}
          initial={{
            firstName: contact.firstName,
            lastName: contact.lastName ?? "",
            phoneE164: contact.phoneE164 ?? "",
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
            ...customFormValues(customFields, contact.custom),
          }}
          options={contactFormOptions(contact.timezone)}
          isNew={false}
          customFields={customFormFields(customFields)}
          submitLabel="Save changes"
          cancelHref={
            companyId
              ? contactPanelHref(companyId, contact.id)
              : contactHref(contact.id)
          }
        />
      </CardContent>
    </Card>
  );
}
