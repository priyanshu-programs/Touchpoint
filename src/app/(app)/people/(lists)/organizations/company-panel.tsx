import { Star } from "lucide-react";
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { CompanyLogo } from "@/components/company-logo";
import {
  arrangeRows,
  DetailRows,
  SECTION_HEADING,
} from "@/components/detail-rows";
import { PhotoPreview } from "@/components/photo-preview";
import { Badge } from "@/components/ui/badge";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateIn, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listTimeline } from "@/modules/activities/queries";
import { listContacts } from "@/modules/contacts/queries";
import {
  latestRun,
  suggestedPeople,
  websiteFields,
} from "@/modules/enrichment/queries";
import { getLayout, listCustomFields } from "@/modules/fields/queries";
import type { StandardKey } from "@/modules/fields/standard";
import type { getOrganization } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { listTasks } from "@/modules/tasks/queries";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import { RecordWorkflows } from "@/app/(app)/workflows/record-workflows";
import {
  addCompanyContactAction,
  addExistingContactAction,
  addSuggestedContactsAction,
  linkSuggestedContactAction,
  setPrimaryContactAction,
} from "../../contacts/actions";
import type { CompanyStatus } from "@/modules/statuses/queries";
import {
  deleteOrganizationAction,
  setOrganizationArchivedAction,
  setOrganizationStatusAction,
} from "../../organizations/actions";
import { customDetailRows } from "../../fields/custom-values";
import { FieldsLink } from "../fields-link";
import { companiesHref, type CompanyListParams } from "../list-controls";
import { AddContactForm } from "./add-contact-form";
import { CompanyActions } from "./company-actions";
import { CompanyStatusMenu } from "./company-status-menu";
import { SuggestedContacts } from "./suggested-contacts";
import { WebsiteDetails } from "./website-details";

const READ_FAILURES: Record<string, string> = {
  unreachable: "the site did not respond",
  blocked: "the address is not a public website",
  timeout: "the site took too long to answer",
  refused: "the site turned the request away",
  robots: "the site asks automated readers to stay away",
  not_html: "the address does not return a web page",
  moved: "the address forwards to a different site",
};

function websiteStatus(
  site: string,
  run: Awaited<ReturnType<typeof latestRun>>,
  timezone: string,
) {
  if (!run) {
    return { summary: `Details can be read from ${site}.`, reading: false };
  }
  if (run.status === "failed") {
    return {
      summary: `Could not read ${site}: ${READ_FAILURES[run.error ?? ""] ?? "something went wrong"}.`,
      reading: false,
    };
  }
  if (run.status === "done" && run.finishedAt) {
    return {
      summary: `Details read from ${site} on ${formatDate(dateIn(timezone, run.finishedAt))}.`,
      reading: false,
    };
  }
  return {
    summary: `Reading ${site}…`,
    detail: "Description, phone, email, location, logo and people",
    reading: true,
  };
}

const TABS = [
  { tab: undefined, label: "Overview" },
  { tab: "contacts", label: "Contacts" },
  { tab: "activity", label: "Activity" },
  { tab: "tasks", label: "Tasks" },
  { tab: "workflows", label: "Workflows" },
] as const;

// Counts come from one capped page, so a full page is shown as "100+".
const upTo = (page: { rows: unknown[]; nextAfter: string | null }) =>
  `${page.rows.length}${page.nextAfter ? "+" : ""}`;

export async function CompanyPanel({
  ownerId,
  organization,
  statuses,
  params,
}: {
  ownerId: string;
  organization: NonNullable<Awaited<ReturnType<typeof getOrganization>>>;
  statuses: CompanyStatus[];
  params: CompanyListParams;
}) {
  const filter = { organizationId: organization.id };
  const [
    settings,
    layout,
    customFields,
    contacts,
    openTasks,
    latest,
    run,
    sourced,
    suggested,
  ] = await Promise.all([
    getSettings(ownerId),
    getLayout(ownerId, "organization"),
    listCustomFields(ownerId, "organization"),
    listContacts(ownerId, { ...filter, limit: 100 }),
    listTasks(ownerId, { ...filter, limit: 100 }),
    listTimeline(ownerId, { ...filter, limit: 1 }),
    latestRun(ownerId, organization.id),
    websiteFields(ownerId, organization.id),
    params.tab === "contacts" ? suggestedPeople(ownerId, organization.id) : [],
  ]);
  const timezone = settings?.timezone ?? "UTC";
  const lastActivity = latest.rows[0]?.occurredAt;
  const site =
    organization.domain ??
    (organization.website ? new URL(organization.website).hostname : null);
  const website = site ? websiteStatus(site, run, timezone) : null;
  const fromWebsite = (field: string) => {
    const found = sourced.find((row) => row.field === field);
    return (
      found && (
        <span className="block text-xs font-normal text-muted-foreground">
          {found.guessed ? "Guessed from website" : "From website"}
        </span>
      )
    );
  };
  const link = (href: string, text: string, external = false) => (
    <a
      href={href}
      className="underline"
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      {text}
    </a>
  );
  const details = arrangeRows<
    StandardKey<"organization"> | `custom.${string}`
  >(layout, {
    ...customDetailRows(customFields, organization.custom, {
      entityType: "organization",
      id: organization.id,
    }),
    name: { value: organization.name },
    domain: { value: organization.domain },
    website: {
      note: fromWebsite("website"),
      value:
        organization.website && link(organization.website, organization.website, true),
    },
    phone: {
      note: fromWebsite("phone"),
      value:
        organization.phone &&
        link(`tel:${organization.phone.replace(/[^\d+]/g, "")}`, organization.phone),
    },
    email: {
      note: fromWebsite("email"),
      value:
        organization.email && link(`mailto:${organization.email}`, organization.email),
    },
    industry: { note: fromWebsite("industry"), value: organization.industry },
    city: { note: fromWebsite("city"), value: organization.city },
    region: { note: fromWebsite("region"), value: organization.region },
    country: { note: fromWebsite("country"), value: organization.country },
  });
  const contactLink = (id: string) =>
    companiesHref(params, { contact: id, tab: undefined, after: undefined });
  const tiles = [
    { label: "Contacts", value: upTo(contacts) },
    { label: "Open tasks", value: upTo(openTasks) },
    {
      label: "Last activity",
      value: lastActivity ? formatDate(dateIn(timezone, lastActivity)) : "—",
    },
  ];

  return (
    <>
      <header className="flex flex-wrap items-start gap-3 border-b p-4 pr-12">
        <CompanyLogo
          id={organization.id}
          name={organization.name}
          logoVersion={organization.logoVersion}
          className="size-10 text-sm"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <SheetTitle className="text-lg break-words">
            {organization.name}
          </SheetTitle>
          {organization.domain && (
            <SheetDescription>{organization.domain}</SheetDescription>
          )}
          <div className="flex flex-wrap gap-1">
            <CompanyStatusMenu
              value={organization.status}
              statuses={statuses}
              action={setOrganizationStatusAction.bind(null, organization.id)}
            />
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
        <CompanyActions
          id={organization.id}
          hasWebsite={Boolean(site)}
          reading={Boolean(website?.reading)}
          editHref={`/people/organizations/${organization.id}/edit`}
          archived={Boolean(organization.archivedAt)}
          archiveAction={setOrganizationArchivedAction}
          remove={{
            title: `Delete ${organization.name}?`,
            description: `The company, its tags, logo and website details are removed for good. ${
              contacts.rows.length === 0
                ? "Its tasks and logged activity"
                : `Its contacts (${upTo(contacts)}), tasks and logged activity`
            } are kept, no longer linked to a company. To hide it instead, use Archive.`,
            confirmLabel: "Delete company",
            action: deleteOrganizationAction,
          }}
        />
      </header>

      <dl className="grid grid-cols-3 divide-x border-b">
        {tiles.map((tile) => (
          <div key={tile.label} className="grid gap-1 p-4">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="font-medium">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <nav
        aria-label="Company"
        className="flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map(({ tab, label }) => (
          <Link
            key={label}
            href={companiesHref(params, { tab, after: undefined })}
            scroll={false}
            aria-current={params.tab === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              params.tab === tab &&
                "border-foreground font-medium text-foreground",
            )}
          >
            {label}
            {tab === "contacts" && contacts.rows.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {upTo(contacts)}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {params.tab === undefined && (
        <div className="grid md:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            aria-labelledby="about-heading"
            className="grid content-start gap-2 p-4 text-sm"
          >
            <h3 id="about-heading" className={SECTION_HEADING}>
              About
            </h3>
            {organization.description ? (
              <p className="break-words whitespace-pre-wrap">
                {organization.description}
                {fromWebsite("description")}
              </p>
            ) : (
              <p className="text-muted-foreground">No description yet.</p>
            )}
          </section>

          <section
            aria-labelledby="details-heading"
            className="grid content-start border-t md:border-t-0 md:border-l"
          >
            <div className="flex items-center justify-between gap-2 p-4">
              <h3 id="details-heading" className={SECTION_HEADING}>
                Details
              </h3>
              <FieldsLink href={companiesHref(params, { fields: "companies" })} />
            </div>
            <DetailRows rows={details} className="px-4 pb-4" />
            {website && <WebsiteDetails {...website} />}
          </section>
        </div>
      )}

      {params.tab !== undefined && (
        <div className="grid gap-6 p-4">
          {params.tab === "contacts" && (
            <>
              {contacts.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contacts at this company yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Title
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Email
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.rows.map((contact) => (
                      <ClickableRow
                        key={contact.id}
                        href={contactLink(contact.id)}
                      >
                        <TableCell className="whitespace-normal">
                          <div className="flex items-center gap-2">
                            <form action={setPrimaryContactAction}>
                              <input type="hidden" name="id" value={contact.id} />
                              <input
                                type="hidden"
                                name="organizationId"
                                value={organization.id}
                              />
                              <input
                                type="hidden"
                                name="primary"
                                value={contact.isPrimary ? "0" : "1"}
                              />
                              <button
                                type="submit"
                                aria-pressed={contact.isPrimary}
                                aria-label={`Primary contact: ${contact.fullName}`}
                                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                              >
                                <Star
                                  aria-hidden
                                  className={cn(
                                    "size-4",
                                    contact.isPrimary &&
                                      "fill-primary text-primary",
                                  )}
                                />
                              </button>
                            </form>
                            <PhotoPreview
                              id={contact.id}
                              name={contact.fullName}
                              photoVersion={contact.photoVersion}
                            />
                            <div className="grid min-w-0 gap-0.5">
                              <Link
                                href={contactLink(contact.id)}
                                scroll={false}
                                className="font-medium underline-offset-4 hover:underline"
                              >
                                {contact.fullName}
                              </Link>
                              {(contact.jobTitle || contact.primaryEmail) && (
                                <p className="text-xs break-words text-muted-foreground sm:hidden">
                                  {[contact.jobTitle, contact.primaryEmail]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {contact.jobTitle ?? "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {contact.primaryEmail ? (
                            <a
                              href={`mailto:${contact.primaryEmail}`}
                              className="underline"
                            >
                              {contact.primaryEmail}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </ClickableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <SuggestedContacts
                people={suggested.map(({ name, title, matches }) => ({
                  name,
                  title,
                  matches,
                }))}
                action={addSuggestedContactsAction.bind(null, organization.id)}
                linkAction={linkSuggestedContactAction.bind(null, organization.id)}
              />
              <AddContactForm
                action={addCompanyContactAction.bind(null, organization.id)}
                linkAction={addExistingContactAction.bind(null, organization.id)}
              />
            </>
          )}

          {params.tab === "activity" && (
            <RecordTimeline
              ownerId={ownerId}
              filter={filter}
              moreHref={(earlier) =>
                companiesHref(params, { tab: "activity", after: earlier })
              }
              newHref={companiesHref(params, { activity: "new" })}
              sendHref={companiesHref(params, { send: "new" })}
              openHref={(id) => companiesHref(params, { activity: id })}
              after={params.after}
            />
          )}

          {params.tab === "tasks" && (
            <RecordTasks
              ownerId={ownerId}
              filter={filter}
              newHref={companiesHref(params, { task: "new" })}
              openHref={(id) => companiesHref(params, { task: id })}
            />
          )}

          {params.tab === "workflows" && (
            <RecordWorkflows ownerId={ownerId} subject={filter} />
          )}
        </div>
      )}
    </>
  );
}
