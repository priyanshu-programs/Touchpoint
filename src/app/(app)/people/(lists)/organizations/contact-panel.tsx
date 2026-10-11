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
import { setContactArchivedAction } from "../../contacts/actions";
import { ContactDetails } from "../../contacts/contact-details";
import { ContactEmailsAndLinks } from "../../contacts/contact-emails-links";
import { labelFor } from "../../labels";
import { companiesHref, type CompanyListParams } from "../list-controls";

const TABS = [
  { tab: undefined, label: "Overview" },
  { tab: "activity", label: "Activity" },
  { tab: "tasks", label: "Tasks" },
] as const;

// One person at the open company, shown in the company's panel with a way back.
export function ContactPanel({
  ownerId,
  organization,
  contact,
  params,
}: {
  ownerId: string;
  organization: NonNullable<Awaited<ReturnType<typeof getOrganization>>>;
  contact: NonNullable<Awaited<ReturnType<typeof getContact>>>;
  params: CompanyListParams;
}) {
  const filter = { contactId: contact.id };
  const company = { contact: undefined, after: undefined };
  const email = contact.emails.find((row) => row.isPrimary)?.email;
  // A company has no "contacts" tab of its own here, so an address carrying one shows the overview.
  const tab = params.tab === "contacts" ? undefined : params.tab;

  return (
    <>
      <header className="flex flex-wrap items-start gap-3 border-b p-4 pr-12">
        <Link
          href={companiesHref(params, { ...company, tab: "contacts" })}
          scroll={false}
          aria-label={`Back to ${organization.name}`}
          className="mt-1.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <Monogram
          name={contact.fullName}
          className="size-10 rounded-full text-sm"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <SheetTitle className="text-lg break-words">
            {contact.fullName}
          </SheetTitle>
          <SheetDescription>
            {[contact.jobTitle, organization.name].filter(Boolean).join(" at ")}
          </SheetDescription>
          <div className="flex flex-wrap gap-1">
            {contact.isPrimary && (
              <Badge>Primary contact at {organization.name}</Badge>
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
            href={`/people/contacts/${contact.id}/edit?from=company`}
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
            <CompanyLogo
              id={organization.id}
              name={organization.name}
              logoVersion={organization.logoVersion}
              className="size-5 text-[0.625rem]"
            />
            <Link
              href={companiesHref(params, { ...company, tab: undefined })}
              scroll={false}
              className="truncate underline-offset-4 hover:underline"
            >
              {organization.name}
            </Link>
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
        // The sheet is a column that scrolls: without this the tab bar is squeezed away under long content.
        className="flex shrink-0 gap-1 overflow-x-auto border-b px-2"
      >
        {TABS.map((item) => (
          <Link
            key={item.label}
            href={companiesHref(params, { tab: item.tab, after: undefined })}
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
            moreHref={(earlier) =>
              companiesHref(params, { tab: "activity", after: earlier })
            }
            newHref={`/activities/new?contact=${contact.id}`}
            after={params.after}
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
