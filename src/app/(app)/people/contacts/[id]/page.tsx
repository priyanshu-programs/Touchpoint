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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getContact } from "@/modules/contacts/queries";
import { LINK_KINDS } from "@/modules/contacts/schema";
import { labelFor, toOptions } from "../../labels";
import {
  removeContactEmailAction,
  removeContactLinkAction,
  setContactArchivedAction,
  setPrimaryEmailAction,
} from "../actions";
import { AddEmailForm, AddLinkForm } from "./add-forms";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  params,
}: PageProps<"/people/contacts/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const contact = await getContact(owner.id, id.data);
  if (!contact) notFound();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {contact.fullName}
          </h1>
          {(contact.jobTitle || contact.organizationId) && (
            <p className="text-muted-foreground">
              {contact.jobTitle}
              {contact.jobTitle && contact.organizationId && " at "}
              {contact.organizationId && (
                <Link
                  href={`/people/organizations/${contact.organizationId}`}
                  className="underline"
                >
                  {contact.organizationName}
                </Link>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">
              {labelFor(contact.relationshipType)}
            </Badge>
            {contact.status !== "active" && (
              <Badge variant="outline">{labelFor(contact.status)}</Badge>
            )}
            {contact.archivedAt && <Badge variant="destructive">Archived</Badge>}
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink
            href={`/people/contacts/${contact.id}/edit`}
            variant="outline"
          >
            Edit
          </ButtonLink>
          <form action={setContactArchivedAction}>
            <input type="hidden" name="id" value={contact.id} />
            <input
              type="hidden"
              name="archived"
              value={contact.archivedAt ? "0" : "1"}
            />
            <Button type="submit" variant="outline">
              {contact.archivedAt ? "Restore" : "Archive"}
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
              {
                label: "Phone",
                value: contact.phoneE164 && (
                  <a href={`tel:${contact.phoneE164}`} className="underline">
                    {contact.phoneE164}
                  </a>
                ),
              },
              { label: "Department", value: contact.department },
              {
                label: "Preferred channel",
                value:
                  contact.preferredChannel && labelFor(contact.preferredChannel),
              },
              {
                label: "Location",
                value: [contact.city, contact.region, contact.country]
                  .filter(Boolean)
                  .join(", "),
              },
              { label: "Time zone", value: contact.timezone },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            The primary address is the one shown in lists.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {contact.emails.length > 0 && (
            <ul className="grid gap-2">
              {contact.emails.map((email) => (
                <li
                  key={email.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <a
                    href={`mailto:${email.email}`}
                    className="break-all underline"
                  >
                    {email.email}
                  </a>
                  {email.label && (
                    <span className="text-muted-foreground">{email.label}</span>
                  )}
                  {email.isPrimary ? (
                    <Badge variant="secondary">Primary</Badge>
                  ) : (
                    <form action={setPrimaryEmailAction}>
                      <input type="hidden" name="contactId" value={contact.id} />
                      <input type="hidden" name="emailId" value={email.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Make primary
                      </Button>
                    </form>
                  )}
                  <form action={removeContactEmailAction} className="ml-auto">
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="emailId" value={email.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${email.email}`}
                    >
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddEmailForm contactId={contact.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {contact.links.length > 0 && (
            <ul className="grid gap-2">
              {contact.links.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">
                    {labelFor(link.kind)}
                  </span>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline"
                  >
                    {link.url}
                  </a>
                  <form action={removeContactLinkAction} className="ml-auto">
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="linkId" value={link.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${labelFor(link.kind)} link`}
                    >
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddLinkForm contactId={contact.id} kinds={toOptions(LINK_KINDS)} />
        </CardContent>
      </Card>
    </div>
  );
}
