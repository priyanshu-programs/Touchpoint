import Link from "next/link";
import { DetailRows } from "@/components/detail-rows";
import type { getContact } from "@/modules/contacts/queries";
import { companyHref, labelFor } from "../labels";

type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

export function ContactDetails({ contact }: { contact: Contact }) {
  const email = contact.emails.find((row) => row.isPrimary)?.email;
  const profile = (kind: string) => {
    const url = contact.links.find((link) => link.kind === kind)?.url;
    return (
      url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      )
    );
  };

  return (
    <DetailRows
      columns={2}
      rows={[
        { label: "First name", value: contact.firstName },
        { label: "Last name", value: contact.lastName },
        { label: "Title", value: contact.jobTitle },
        { label: "Department", value: contact.department },
        {
          label: "Email",
          value: email && (
            <a href={`mailto:${email}`} className="underline">
              {email}
            </a>
          ),
        },
        {
          label: "Phone",
          value: contact.phoneE164 && (
            <a href={`tel:${contact.phoneE164}`} className="underline">
              {contact.phoneE164}
            </a>
          ),
        },
        { label: "LinkedIn", value: profile("linkedin") },
        { label: "X", value: profile("x") },
        { label: "GitHub", value: profile("github") },
        {
          label: "Company",
          value: contact.organizationId && (
            <Link
              href={companyHref(contact.organizationId)}
              className="underline"
            >
              {contact.organizationName}
            </Link>
          ),
        },
        {
          label: "Location",
          value: [contact.city, contact.region, contact.country]
            .filter(Boolean)
            .join(", "),
        },
        { label: "Time zone", value: contact.timezone },
        {
          label: "Preferred channel",
          value: contact.preferredChannel && labelFor(contact.preferredChannel),
        },
      ]}
    />
  );
}
