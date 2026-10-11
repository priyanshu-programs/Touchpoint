import { Star } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import { CompanyLogo, Monogram } from "@/components/company-logo";
import {
  DetailRows,
  SECTION_HEADING,
  type DetailRow,
} from "@/components/detail-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { latestRun, websiteFields } from "@/modules/enrichment/queries";
import type { getOrganization } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { listTasks } from "@/modules/tasks/queries";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import {
  addCompanyContactAction,
  setPrimaryContactAction,
} from "../../contacts/actions";
import { labelFor } from "../../labels";
import { setOrganizationArchivedAction } from "../../organizations/actions";
import { companiesHref, type CompanyListParams } from "../list-controls";
import { AddContactForm } from "./add-contact-form";
import { DeleteCompanyDialog } from "./delete-company-dialog";
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
    return {
      summary: `Details can be read from ${site}.`,
      reading: false,
      actionLabel: "Read from website",
    };
  }
  if (run.status === "failed") {
    return {
      summary: `Could not read ${site}: ${READ_FAILURES[run.error ?? ""] ?? "something went wrong"}.`,
      reading: false,
      actionLabel: "Try again",
    };
  }
  if (run.status === "done" && run.finishedAt) {
    return {
      summary: `Details read from ${site} on ${formatDate(dateIn(timezone, run.finishedAt))}.`,
      reading: false,
      actionLabel: "Refresh from website",
    };
  }
  return {
    summary: `Reading ${site}…`,
    detail: "Description, phone, email, location and logo",
    reading: true,
    actionLabel: "",
  };
}

const TABS = [
  { tab: undefined, label: "Overview" },
  { tab: "contacts", label: "Contacts" },
  { tab: "activity", label: "Activity" },
  { tab: "tasks", label: "Tasks" },
] as const;

// Counts come from one capped page, so a full page is shown as "100+".
const upTo = (page: { rows: unknown[]; nextAfter: string | null }) =>
  `${page.rows.length}${page.nextAfter ? "+" : ""}`;

export async function CompanyPanel({
  ownerId,
  organization,
  params,
}: {
  ownerId: string;
  organization: NonNullable<Awaited<ReturnType<typeof getOrganization>>>;
  params: CompanyListParams;
}) {
  const filter = { organizationId: organization.id };
  const [settings, contacts, openTasks, latest, run, sourced] =
    await Promise.all([
      getSettings(ownerId),
      listContacts(ownerId, { ...filter, limit: 100 }),
      listTasks(ownerId, { ...filter, limit: 100 }),
      listTimeline(ownerId, { ...filter, limit: 1 }),
      latestRun(ownerId, organization.id),
      websiteFields(ownerId, organization.id),
    ]);
  const timezone = settings?.timezone ?? "UTC";
  const lastActivity = latest.rows[0]?.occurredAt;
  const site =
    organization.domain ??
    (organization.website ? new URL(organization.website).hostname : null);
  const fromWebsite = (field: string) =>
    sourced.includes(field) && (
      <span className="block text-xs font-normal text-muted-foreground">
        From website
      </span>
    );
  const link = (href: string, text: string, external = false) => (
    <a
      href={href}
      className="underline"
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      {text}
    </a>
  );
  const details: DetailRow[] = [
    { label: "Name", value: organization.name },
    { label: "Domain", value: organization.domain },
    {
      label: "Website",
      note: fromWebsite("website"),
      value:
        organization.website && link(organization.website, organization.website, true),
    },
    {
      label: "Phone",
      note: fromWebsite("phone"),
      value:
        organization.phone &&
        link(`tel:${organization.phone.replace(/[^\d+]/g, "")}`, organization.phone),
    },
    {
      label: "Email",
      note: fromWebsite("email"),
      value:
        organization.email && link(`mailto:${organization.email}`, organization.email),
    },
    { label: "Industry", value: organization.industry },
    { label: "City", note: fromWebsite("city"), value: organization.city },
    { label: "Region", note: fromWebsite("region"), value: organization.region },
    { label: "Country", note: fromWebsite("country"), value: organization.country },
  ];
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
          <ButtonLink
            href={`/people/organizations/${organization.id}/edit`}
            variant="outline"
            size="sm"
          >
            Edit
          </ButtonLink>
          <form action={setOrganizationArchivedAction}>
            <input type="hidden" name="id" value={organization.id} />
            <input
              type="hidden"
              name="archived"
              value={organization.archivedAt ? "0" : "1"}
            />
            <Button type="submit" variant="outline" size="sm">
              {organization.archivedAt ? "Restore" : "Archive"}
            </Button>
          </form>
          <DeleteCompanyDialog
            id={organization.id}
            name={organization.name}
            contacts={upTo(contacts)}
          />
        </div>
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
            <h3 id="details-heading" className={cn(SECTION_HEADING, "p-4")}>
              Details
            </h3>
            <DetailRows rows={details} className="px-4 pb-4" />
            {site && (
              <WebsiteDetails
                organizationId={organization.id}
                {...websiteStatus(site, run, timezone)}
              />
            )}
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
                            <Monogram
                              name={contact.fullName}
                              className="rounded-full"
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
              <AddContactForm
                action={addCompanyContactAction.bind(null, organization.id)}
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
              newHref={`/activities/new?organization=${organization.id}`}
              after={params.after}
            />
          )}

          {params.tab === "tasks" && (
            <RecordTasks
              ownerId={ownerId}
              filter={filter}
              newHref={`/tasks/new?organization=${organization.id}`}
            />
          )}
        </div>
      )}
    </>
  );
}
