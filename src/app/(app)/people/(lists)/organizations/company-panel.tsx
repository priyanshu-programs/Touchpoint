import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/button-link";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
import { addCompanyContactAction } from "../../contacts/actions";
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

const SECTION_HEADING =
  "text-xs font-medium tracking-wide text-muted-foreground uppercase";

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
  const details: { label: string; value: ReactNode; field?: string }[] = [
    { label: "Name", value: organization.name },
    { label: "Domain", value: organization.domain },
    {
      label: "Website",
      field: "website",
      value:
        organization.website && link(organization.website, organization.website, true),
    },
    {
      label: "Phone",
      field: "phone",
      value:
        organization.phone &&
        link(`tel:${organization.phone.replace(/[^\d+]/g, "")}`, organization.phone),
    },
    {
      label: "Email",
      field: "email",
      value:
        organization.email && link(`mailto:${organization.email}`, organization.email),
    },
    { label: "Industry", value: organization.industry },
    { label: "City", field: "city", value: organization.city },
    { label: "Region", field: "region", value: organization.region },
    { label: "Country", field: "country", value: organization.country },
  ];
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
        className="flex gap-1 overflow-x-auto border-b px-2"
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
            <dl className="grid gap-3 px-4 pb-4 text-sm">
              {details.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium break-words">
                    {row.value ?? (
                      <span className="font-normal text-muted-foreground">
                        —
                      </span>
                    )}
                    {row.value && row.field && fromWebsite(row.field)}
                  </dd>
                </div>
              ))}
            </dl>
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
                <ul className="grid gap-3">
                  {contacts.rows.map((contact) => (
                    <li key={contact.id} className="grid min-w-0 gap-0.5">
                      <Link
                        href={`/people/contacts/${contact.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {contact.fullName}
                      </Link>
                      <p className="text-sm break-words text-muted-foreground">
                        {[contact.jobTitle, contact.primaryEmail]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <section
                aria-labelledby="add-contact-heading"
                className="grid gap-4 border-t pt-4"
              >
                <h3 id="add-contact-heading" className="font-medium">
                  Add a contact
                </h3>
                {/* Remounted after each new contact, so the fields start empty again. */}
                <AddContactForm
                  key={contacts.rows.length}
                  action={addCompanyContactAction.bind(null, organization.id)}
                />
              </section>
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
