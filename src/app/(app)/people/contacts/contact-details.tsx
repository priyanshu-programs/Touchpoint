import Link from "next/link";
import { arrangeRows, DetailRows } from "@/components/detail-rows";
import type { getContact } from "@/modules/contacts/queries";
import { getLayout } from "@/modules/fields/queries";
import type { StandardKey } from "@/modules/fields/standard";
import { companyHref, labelFor } from "../labels";

type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

export async function ContactDetails({
  ownerId,
  contact,
}: {
  ownerId: string;
  contact: Contact;
}) {
  const layout = await getLayout(ownerId, "contact");
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
      rows={arrangeRows<StandardKey<"contact">>(layout, {
        firstName: { value: contact.firstName },
        lastName: { value: contact.lastName },
        jobTitle: { value: contact.jobTitle },
        department: { value: contact.department },
        email: {
          value: email && (
            <a href={`mailto:${email}`} className="underline">
              {email}
            </a>
          ),
        },
        phone: {
          value: contact.phoneE164 && (
            <a href={`tel:${contact.phoneE164}`} className="underline">
              {contact.phoneE164}
            </a>
          ),
        },
        linkedin: { value: profile("linkedin") },
        x: { value: profile("x") },
        github: { value: profile("github") },
        companies: {
          label: contact.companies.length > 1 ? "Companies" : undefined,
          value: contact.companies.length > 0 && (
            <ul className="grid gap-0.5">
              {contact.companies.map((company) => (
                <li key={company.id}>
                  <Link href={companyHref(company.id)} className="underline">
                    {company.name}
                  </Link>
                </li>
              ))}
            </ul>
          ),
        },
        location: {
          value: [contact.city, contact.region, contact.country]
            .filter(Boolean)
            .join(", "),
        },
        timezone: { value: contact.timezone },
        preferredChannel: {
          value: contact.preferredChannel && labelFor(contact.preferredChannel),
        },
      })}
    />
  );
}
