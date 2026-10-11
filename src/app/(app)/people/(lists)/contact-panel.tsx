import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { CompanyLogo, Monogram } from "@/components/company-logo";
import { SECTION_HEADING } from "@/components/detail-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { getContact } from "@/modules/contacts/queries";
import type { getOrganization } from "@/modules/organizations/queries";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import { setContactArchivedAction } from "../contacts/actions";
import { ContactDetails } from "../contacts/contact-details";
import { ContactEmailsAndLinks } from "../contacts/contact-emails-links";
import { labelFor } from "../labels";

type Tab = "activity" | "tasks" | undefined;

const TABS = [
  { tab: undefined, label: "Overview" },
  { tab: "activity", label: "Activity" },
  { tab: "tasks", label: "Tasks" },
] as const;

// One person, shown in the panel over the people list or inside their company's panel.
export function ContactPanel({
  ownerId,
  contact,
  company,
  tab,
  after,
  hrefFor,
  back,
  editFrom,
}: {
  ownerId: string;
  contact: NonNullable<Awaited<ReturnType<typeof getContact>>>;
  // The person's company and where its name leads from here.
  company: {
    organization: NonNullable<Awaited<ReturnType<typeof getOrganization>>>;
    href: string;
  } | null;
  tab: Tab;
  // Where the Activity tab's page of history starts.
  after?: string;
  hrefFor: (change: { tab: Tab; after?: string }) => string;
  // Set inside a company's panel, which this view replaces until the owner goes back.
  back?: { href: string; label: string };
  editFrom?: "company";
}) {
  const filter = { contactId: contact.id };
  const email = contact.emails.find((row) => row.isPrimary)?.email;

  return (
    <>
      <header className="flex flex-wrap items-start gap-3 border-b p-4 pr-12">
        {back && (
          <Link
            href={back.href}
            scroll={false}
            aria-label={back.label}
            className="mt-1.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
        )}
        <Monogram
          name={contact.fullName}
          className="size-10 rounded-full text-sm"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <SheetTitle className="text-lg break-words">
            {contact.fullName}
          </SheetTitle>
          {(contact.jobTitle || company) && (
            <SheetDescription>
              {[contact.jobTitle, company?.organization.name]
                .filter(Boolean)
                .join(" at ")}
            </SheetDescription>
          )}
          <div className="flex flex-wrap gap-1">
            {contact.isPrimary && company && (
              <Badge>Primary contact at {company.organization.name}</Badge>
            )}
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
            href={`/people/contacts/${contact.id}/edit${editFrom ? `?from=${editFrom}` : ""}`}
            variant="outline"
            size="sm"
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
            <Button type="submit" variant="outline" size="sm">
              {contact.archivedAt ? "Restore" : "Archive"}
            </Button>
          </form>
        </div>
      </header>

      {/* Details right below says the same, so a phone screen goes without the tiles. */}
      <dl className="hidden grid-cols-3 divide-x border-b sm:grid">
        <div className="grid min-w-0 gap-1 p-4">
          <dt className="text-xs text-muted-foreground">Company</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            {company ? (
              <>
                <CompanyLogo
                  id={company.organization.id}
                  name={company.organization.name}
                  logoVersion={company.organization.logoVersion}
                  className="size-5 text-[0.625rem]"
                />
                <Link
                  href={company.href}
                  scroll={false}
                  className="truncate underline-offset-4 hover:underline"
                >
                  {company.organization.name}
                </Link>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="grid min-w-0 gap-1 p-4">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="truncate font-medium">{email ?? "—"}</dd>
        </div>
        <div className="grid min-w-0 gap-1 p-4">
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="truncate font-medium">{contact.phoneE164 ?? "—"}</dd>
        </div>
      </dl>

      <nav
        aria-label="Contact"
        className="flex gap-1 overflow-x-auto border-b px-2"
      >
        {TABS.map((item) => (
          <Link
            key={item.label}
            href={hrefFor({ tab: item.tab })}
            scroll={false}
            aria-current={tab === item.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === item.tab && "border-foreground font-medium text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 p-4">
        {tab === undefined && (
          <>
            <section aria-labelledby="contact-details" className="grid gap-4">
              <h3 id="contact-details" className={SECTION_HEADING}>
                Details
              </h3>
              <ContactDetails contact={contact} />
            </section>
            <ContactEmailsAndLinks contact={contact} />
          </>
        )}

        {tab === "activity" && (
          <RecordTimeline
            ownerId={ownerId}
            filter={filter}
            moreHref={(earlier) => hrefFor({ tab: "activity", after: earlier })}
            newHref={`/activities/new?contact=${contact.id}`}
            after={after}
          />
        )}

        {tab === "tasks" && (
          <RecordTasks
            ownerId={ownerId}
            filter={filter}
            newHref={`/tasks/new?contact=${contact.id}`}
          />
        )}
      </div>
    </>
  );
}
