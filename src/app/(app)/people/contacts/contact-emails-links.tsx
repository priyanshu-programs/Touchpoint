import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { getContact } from "@/modules/contacts/queries";
import { LINK_KINDS } from "@/modules/contacts/schema";
import { labelFor, toOptions } from "../labels";
import { AddEmailForm, AddLinkForm } from "./[id]/add-forms";
import {
  removeContactEmailAction,
  removeContactLinkAction,
  setPrimaryEmailAction,
} from "./actions";

type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

export function ContactEmailsAndLinks({ contact }: { contact: Contact }) {
  return (
    <>
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
    </>
  );
}
