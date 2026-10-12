import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { getContact } from "@/modules/contacts/queries";
import { companyHref } from "../labels";
import { AddCompanyForm } from "./[id]/add-forms";
import {
  removeContactCompanyAction,
  setContactCompanyTitleAction,
} from "./actions";

type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

// Every company the person is at, each with the title they hold there.
export function ContactCompanies({ contact }: { contact: Contact }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <CardDescription>
          One person can be at several companies, with a different title at each.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {contact.companies.length > 0 && (
          <ul className="grid gap-3">
            {contact.companies.map((company) => (
              <li key={company.id} className="flex flex-wrap items-center gap-2">
                <CompanyLogo
                  id={company.id}
                  name={company.name}
                  logoVersion={company.logoVersion}
                  className="size-5 text-[0.625rem]"
                />
                <Link
                  href={companyHref(company.id)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {company.name}
                </Link>
                {company.isPrimary && (
                  <Badge variant="secondary">Primary contact</Badge>
                )}
                <form
                  // A saved title comes back as the new starting value.
                  key={company.jobTitle ?? ""}
                  action={setContactCompanyTitleAction}
                  className="ml-auto flex gap-2"
                >
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="organizationId" value={company.id} />
                  <Input
                    name="jobTitle"
                    aria-label={`Title at ${company.name}`}
                    defaultValue={company.jobTitle ?? ""}
                    // Left empty, the person's own title is the one shown there.
                    placeholder={contact.jobTitle ?? "Title there"}
                    maxLength={150}
                    className="w-full sm:w-52"
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={`Save title at ${company.name}`}
                  >
                    Save
                  </Button>
                </form>
                <form action={removeContactCompanyAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="organizationId" value={company.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove from ${company.name}`}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddCompanyForm contactId={contact.id} />
      </CardContent>
    </Card>
  );
}
