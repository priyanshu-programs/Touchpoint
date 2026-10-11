import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ButtonLink } from "@/components/button-link";
import { DetailList } from "@/components/detail-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { listContacts } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { labelFor } from "../../labels";
import { setOrganizationArchivedAction } from "../actions";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage({
  params,
  searchParams,
}: PageProps<"/people/organizations/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const after = z.uuid().safeParse((await searchParams).after);
  const [organization, contacts] = await Promise.all([
    getOrganization(owner.id, id.data),
    listContacts(owner.id, {
      organizationId: id.data,
      after: after.success ? after.data : undefined,
    }),
  ]);
  if (!organization) notFound();
  const path = `/people/organizations/${organization.id}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {organization.name}
          </h1>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{labelFor(organization.status)}</Badge>
            {organization.archivedAt && (
              <Badge variant="destructive">Archived</Badge>
            )}
            {organization.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`${path}/edit`} variant="outline">
            Edit
          </ButtonLink>
          <form action={setOrganizationArchivedAction}>
            <input type="hidden" name="id" value={organization.id} />
            <input
              type="hidden"
              name="archived"
              value={organization.archivedAt ? "0" : "1"}
            />
            <Button type="submit" variant="outline">
              {organization.archivedAt ? "Restore" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

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
              No contacts at this organization yet.
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
