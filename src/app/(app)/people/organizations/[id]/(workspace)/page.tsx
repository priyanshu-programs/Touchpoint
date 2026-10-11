import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ButtonLink } from "@/components/button-link";
import { DetailList } from "@/components/detail-list";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listContacts } from "@/modules/contacts/queries";
import { loadOrganization } from "../load";

export const metadata: Metadata = { title: "Company" };

export default async function OrganizationPage({
  params,
  searchParams,
}: PageProps<"/people/organizations/[id]">) {
  const { owner, organization } = await loadOrganization((await params).id);
  const after = z.uuid().safeParse((await searchParams).after);
  const contacts = await listContacts(owner.id, {
    organizationId: organization.id,
    after: after.success ? after.data : undefined,
  });
  const path = `/people/organizations/${organization.id}`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Domain", value: organization.domain },
              {
                label: "Website",
                value: organization.website && (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline"
                  >
                    {organization.website}
                  </a>
                ),
              },
              { label: "Industry", value: organization.industry },
              {
                label: "Location",
                value: [
                  organization.city,
                  organization.region,
                  organization.country,
                ]
                  .filter(Boolean)
                  .join(", "),
              },
              {
                label: "Description",
                value: organization.description && (
                  <span className="whitespace-pre-wrap">
                    {organization.description}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardAction>
            <ButtonLink
              href={`/people/contacts/new?organization=${organization.id}`}
              variant="outline"
              size="sm"
            >
              Add contact
            </ButtonLink>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {contacts.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contacts at this company yet.
            </p>
          ) : (
            <ul className="grid gap-2">
              {contacts.rows.map((contact) => (
                <li key={contact.id} className="flex flex-wrap gap-x-2">
                  <Link
                    href={`/people/contacts/${contact.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {contact.fullName}
                  </Link>
                  <span className="text-muted-foreground">
                    {[contact.jobTitle, contact.primaryEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {contacts.nextAfter && (
            <Link
              href={`${path}?after=${contacts.nextAfter}`}
              className="justify-self-start text-sm underline"
            >
              More contacts
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
