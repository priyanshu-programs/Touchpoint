import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { SECTION_HEADING } from "@/components/detail-rows";
import { PhotoPreview } from "@/components/photo-preview";
import { Badge } from "@/components/ui/badge";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { getContact } from "@/modules/contacts/queries";
import { RELATIONSHIP_TYPES } from "@/modules/contacts/schema";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import { RecordWorkflows } from "@/app/(app)/workflows/record-workflows";
import {
  deleteContactAction,
  removeContactPhotoAction,
  searchContactsAction,
  setContactArchivedAction,
  setContactRelationshipAction,
} from "../contacts/actions";
import { ContactCompanies } from "../contacts/contact-companies";
import { ContactDetails } from "../contacts/contact-details";
import { ContactEmailsAndLinks } from "../contacts/contact-emails-links";
import { ProfileSuggestions } from "../contacts/profile-suggestions";
import { companyHref, labelFor, toOptions } from "../labels";
import { FieldsLink } from "./fields-link";
import { RecordActions } from "./record-actions";
import { StatusMenu } from "./status-menu";

type Tab = "activity" | "tasks" | "workflows" | undefined;

const TABS = [
  { tab: undefined, label: "Overview" },
  { tab: "activity", label: "Activity" },
  { tab: "tasks", label: "Tasks" },
  { tab: "workflows", label: "Workflows" },
] as const;

// One person, shown in the panel over the people list or inside the panel of a company they are at.
export function ContactPanel({
  ownerId,
  contact,
  inside,
  tab,
  after,
  hrefFor,
  entryHref,
  fieldsHref,
}: {
  ownerId: string;
  contact: NonNullable<Awaited<ReturnType<typeof getContact>>>;
  // Set inside a company's panel, which this view replaces until the owner goes back:
  // the company, where its name leads from here, and the way back.
  inside?: { id: string; href: string; back: { href: string; label: string } };
  tab: Tab;
  // Where the Activity tab's page of history starts.
  after?: string;
  hrefFor: (change: { tab: Tab; after?: string }) => string;
  // An activity or a task, new or existing, opened in place of this person.
  entryHref: (entry: { activity: string } | { task: string } | { send: "new" }) => string;
  // The Fields panel, opened over this person.
  fieldsHref: string;
}) {
  const filter = { contactId: contact.id };
  const email = contact.emails.find((row) => row.isPrimary)?.email;
  // The company this view is about: the one it was opened in, else the person's first.
  const company =
    contact.companies.find(({ id }) => id === inside?.id) ?? contact.companies[0];
  const others = contact.companies.length - 1;
  // Said in the heading only when it cannot mislead: here, or when there is no other.
  const named = inside || others === 0 ? company : undefined;
  const starred = inside
    ? contact.companies.filter(({ id, isPrimary }) => isPrimary && id === inside.id)
    : contact.companies.filter(({ isPrimary }) => isPrimary);

  return (
    <>
      <header className="flex flex-wrap items-start gap-3 border-b p-4 pr-12">
        {inside && (
          <Link
            href={inside.back.href}
            scroll={false}
            aria-label={inside.back.label}
            className="mt-1.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
        )}
        <PhotoPreview
          id={contact.id}
          name={contact.fullName}
          photoVersion={contact.photoVersion}
          className="size-10 text-sm"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <SheetTitle className="text-lg break-words">
            {contact.fullName}
          </SheetTitle>
          {(contact.jobTitle || named) && (
            <SheetDescription>
              {[named?.jobTitle ?? contact.jobTitle, named?.name]
                .filter(Boolean)
                .join(" at ")}
            </SheetDescription>
          )}
          <div className="flex flex-wrap gap-1">
            {starred.map(({ id, name }) => (
              <Badge key={id}>Primary contact at {name}</Badge>
            ))}
            <StatusMenu
              label="Relationship"
              value={contact.relationshipType}
              options={toOptions(RELATIONSHIP_TYPES)}
              action={setContactRelationshipAction.bind(null, contact.id)}
            />
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
        <RecordActions
          id={contact.id}
          editHref={`/people/contacts/${contact.id}/edit${inside ? `?company=${inside.id}` : ""}`}
          archived={Boolean(contact.archivedAt)}
          archiveAction={setContactArchivedAction}
          removePhotoAction={
            contact.photoVersion ? removeContactPhotoAction : undefined
          }
          merge={{ noun: "person", plural: "people", search: searchContactsAction }}
          remove={{
            title: `Delete ${contact.fullName}?`,
            description:
              "The person, their emails, links and tags are removed for good, at every company they are at, and they are taken off the activities logged with them. Their tasks are kept, no longer linked to a person. To hide them instead, use Archive.",
            confirmLabel: "Delete contact",
            action: deleteContactAction,
            fields: { company: inside?.id ?? "" },
          }}
        />
      </header>

      {/* Details right below says the same, so a phone screen goes without the tiles. */}
      <dl className="hidden grid-cols-3 divide-x border-b sm:grid">
        <div className="grid min-w-0 gap-1 p-4">
          <dt className="text-xs text-muted-foreground">Company</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            {company ? (
              <>
                <CompanyLogo
                  id={company.id}
                  name={company.name}
                  logoVersion={company.logoVersion}
                  className="size-5 text-[0.625rem]"
                />
                <Link
                  href={inside?.href ?? companyHref(company.id)}
                  scroll={false}
                  className="truncate underline-offset-4 hover:underline"
                >
                  {company.name}
                </Link>
                {others > 0 && (
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    +{others}
                  </span>
                )}
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
        className="flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              <div className="flex items-center justify-between gap-2">
                <h3 id="contact-details" className={SECTION_HEADING}>
                  Details
                </h3>
                <FieldsLink href={fieldsHref} />
              </div>
              <ContactDetails ownerId={ownerId} contact={contact} />
            </section>
            <ProfileSuggestions ownerId={ownerId} contact={contact} />
            <ContactCompanies contact={contact} />
            <ContactEmailsAndLinks contact={contact} />
          </>
        )}

        {tab === "activity" && (
          <RecordTimeline
            ownerId={ownerId}
            filter={filter}
            moreHref={(earlier) => hrefFor({ tab: "activity", after: earlier })}
            newHref={entryHref({ activity: "new" })}
            sendHref={entryHref({ send: "new" })}
            openHref={(id) => entryHref({ activity: id })}
            after={after}
          />
        )}

        {tab === "tasks" && (
          <RecordTasks
            ownerId={ownerId}
            filter={filter}
            newHref={entryHref({ task: "new" })}
            openHref={(id) => entryHref({ task: id })}
          />
        )}

        {tab === "workflows" && (
          <RecordWorkflows ownerId={ownerId} subject={filter} />
        )}
      </div>
    </>
  );
}
