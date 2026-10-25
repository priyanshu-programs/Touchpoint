import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { CompanyLogo } from "@/components/company-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/session";
import { dateIn, formatDate } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import {
  getOrganization,
  listOrganizations,
  ORGANIZATION_SORTS,
} from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { listCompanyStatuses } from "@/modules/statuses/queries";
import { listTags } from "@/modules/tags/queries";
import {
  archiveOrganizationsAction,
  deleteOrganizationsAction,
} from "../../organizations/actions";
import { COLUMN_COOKIES, COMPANY_COLUMNS, hiddenColumns } from "../columns";
import { ContactPanel } from "../contact-panel";
import { EntryPanel, entryKey, entryTab, findEntry } from "../entry-panel";
import { FieldsPanel } from "../fields-panel";
import { ListCard, ListFooter } from "../list-card";
import {
  companiesHref,
  companyListParams,
  type CompanyListParams,
} from "../list-controls";
import { ListHeader } from "../list-header";
import { ListToolbar } from "../list-toolbar";
import { contactHref } from "../../labels";
import { MergePanel } from "../merge-panel";
import { RecordSheet } from "../record-sheet";
import { RowCheckbox, SelectAll, Selection } from "../selection";
import { StatusBadge } from "../status-badge";
import { CompanyPanel } from "./company-panel";
import { NewCompanySheet } from "./new-company-sheet";

export const metadata: Metadata = { title: "Companies" };

const PAGE_SIZE = 50;
type Sort = NonNullable<CompanyListParams["sort"]>;
const SORT_LABELS: Record<Sort, string> = {
  name: "Company",
  domain: "Domain",
  industry: "Industry",
  contacts: "Contacts",
  activity: "Last activity",
};
// The direction a column takes when it is first chosen: text A to Z, numbers and dates largest first.
const FIRST_DIRECTION = {
  name: "asc",
  domain: "asc",
  industry: "asc",
  contacts: "desc",
  activity: "desc",
} as const;
const NO_ENTRY = {
  activity: undefined,
  task: undefined,
  send: undefined,
  merge: undefined,
};
const NO_CONTACT = {
  ...NO_ENTRY,
  contact: undefined,
  tab: undefined,
  after: undefined,
  fields: undefined,
};
const NO_PANEL = { ...NO_CONTACT, company: undefined };
// A change to what the list shows starts again from its first page, with no record open.
const FIRST_PAGE = { ...NO_PANEL, page: undefined };

// Where a column is in the order now, and the address that sorts by it: the other
// direction when it already leads, its own first direction otherwise.
function sorting(params: CompanyListParams, sort: Sort) {
  const current = (params.sort ?? "name") === sort;
  const dir = params.dir ?? FIRST_DIRECTION[sort];
  const next = current
    ? dir === "asc"
      ? "desc"
      : "asc"
    : FIRST_DIRECTION[sort];
  return {
    current: current ? dir : null,
    href: companiesHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

function SortHead({
  params,
  sort,
  className,
}: {
  params: CompanyListParams;
  sort: Sort;
  className?: string;
}) {
  const { current, href } = sorting(params, sort);
  const Icon =
    current === "asc" ? ArrowUp : current === "desc" ? ArrowDown : ArrowDownUp;
  return (
    <TableHead
      aria-sort={
        current ? (current === "asc" ? "ascending" : "descending") : undefined
      }
      className={className}
    >
      <Link
        href={href}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {SORT_LABELS[sort]}
        <Icon
          className={current ? "size-3 text-foreground" : "size-3 opacity-50"}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}

export default async function OrganizationsPage({
  searchParams,
}: PageProps<"/people/organizations">) {
  const owner = await requireOwner();
  const typed = companyListParams.parse(await searchParams);
  const [statuses, entry, jar] = await Promise.all([
    listCompanyStatuses(owner.id),
    typed.company ? findEntry(owner.id, typed) : null,
    cookies(),
  ]);
  const hidden = hiddenColumns(
    jar.get(COLUMN_COOKIES.companies)?.value,
    COMPANY_COLUMNS,
  );
  const shows = (column: (typeof COMPANY_COLUMNS)[number]["key"]) =>
    !hidden.includes(column);
  // A status the owner does not have, or no longer has, narrows nothing, and an
  // entry that is not theirs opens nothing.
  const params = {
    ...typed,
    status: statuses.some(({ key }) => key === typed.status)
      ? typed.status
      : undefined,
    activity: entry?.kind === "activity" ? typed.activity : undefined,
    task: entry?.kind === "task" ? typed.task : undefined,
  };
  const sort = params.sort ?? "name";
  const pageNumber = params.page ?? 1;
  const [page, tags, settings, open, person] = await Promise.all([
    listOrganizations(owner.id, {
      q: params.q,
      tagId: params.tag,
      status: params.status,
      archived: params.archived === "1",
      sort,
      dir: params.dir ?? FIRST_DIRECTION[sort],
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    listTags(owner.id),
    getSettings(owner.id),
    params.company ? getOrganization(owner.id, params.company) : null,
    params.company && params.contact
      ? getContact(owner.id, params.contact)
      : null,
  ]);
  // Someone who is not, or no longer, at this company is not shown under it.
  const contact =
    open && person?.companies.some((company) => company.id === open.id)
      ? person
      : null;
  const timezone = settings?.timezone ?? "UTC";
  const filtered = Boolean(
    params.q || params.tag || params.status || params.archived,
  );
  const filters = [
    {
      label: "Status",
      value: params.status ?? "",
      options: [
        {
          value: "",
          label: "All statuses",
          href: companiesHref(params, { ...FIRST_PAGE, status: undefined }),
        },
        ...statuses.map(({ key, label, color }) => ({
          value: key,
          label,
          color,
          href: companiesHref(params, { ...FIRST_PAGE, status: key }),
        })),
      ],
    },
    ...(tags.length > 0
      ? [
          {
            label: "Tag",
            value: params.tag ?? "",
            options: [
              {
                value: "",
                label: "All tags",
                href: companiesHref(params, { ...FIRST_PAGE, tag: undefined }),
              },
              ...tags.map((tag) => ({
                value: tag.id,
                label: tag.name,
                href: companiesHref(params, { ...FIRST_PAGE, tag: tag.id }),
              })),
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-6">
      <ListHeader
        title="Companies"
        subtitle="Every company you work with."
        // A new one each time a company opens, so the form is not left open over the company it made.
        action={<NewCompanySheet key={params.company ?? "list"} />}
      />

      <div className="grid gap-4">
        <ListToolbar
          path="/people/organizations"
          search={{
            label: "Search companies by name or domain",
            placeholder: "Search companies by name or domain…",
            value: params.q,
          }}
          keep={{
            tag: params.tag,
            status: params.status,
            archived: params.archived,
            sort: params.sort,
            dir: params.dir,
          }}
          filters={filters}
          sorts={ORGANIZATION_SORTS.map((column) => ({
            label: SORT_LABELS[column],
            ...sorting(params, column),
          }))}
          columns={{
            cookie: COLUMN_COOKIES.companies,
            options: COMPANY_COLUMNS,
            hidden,
          }}
          archived={{
            on: params.archived === "1",
            href: companiesHref(params, {
              ...FIRST_PAGE,
              archived: params.archived ? undefined : "1",
            }),
          }}
        />

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No companies match these filters."
              : "No companies yet. Add a company or agency you work with."}
          </p>
        ) : (
          <Selection
            ids={page.rows.map((row) => row.id)}
            noun={{ one: "company", many: "companies" }}
            archived={params.archived === "1"}
            archiveAction={archiveOrganizationsAction}
            deleteAction={deleteOrganizationsAction}
            deleteNote="The companies, their tags, logos and website details are removed for good. Their contacts, tasks and logged activity are kept, no longer linked to a company. To hide them instead, use Archive."
          >
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 p-0!">
                      <SelectAll />
                    </TableHead>
                    <SortHead params={params} sort="name" />
                    {shows("status") && (
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                    )}
                    {shows("domain") && (
                      <SortHead
                        params={params}
                        sort="domain"
                        className="hidden sm:table-cell"
                      />
                    )}
                    {shows("industry") && (
                      <SortHead
                        params={params}
                        sort="industry"
                        className="hidden md:table-cell"
                      />
                    )}
                    {/* The last column on a phone, where the one after it is hidden. */}
                    {shows("contacts") && (
                      <SortHead
                        params={params}
                        sort="contacts"
                        className="pr-4 text-right sm:pr-2"
                      />
                    )}
                    {shows("activity") && (
                      <SortHead
                        params={params}
                        sort="activity"
                        className="hidden text-right sm:table-cell"
                      />
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = companiesHref(params, {
                      ...NO_PANEL,
                      company: row.id,
                    });
                    const status = statuses.find(({ key }) => key === row.status);
                    return (
                      <ClickableRow
                        key={row.id}
                        href={href}
                        className="has-checked:bg-muted/50"
                      >
                        <TableCell className="w-10 p-0!">
                          <RowCheckbox id={row.id} name={row.name} />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex items-center gap-3">
                            <CompanyLogo
                              id={row.id}
                              name={row.name}
                              logoVersion={row.logoVersion}
                            />
                            <Link
                              href={href}
                              scroll={false}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </Link>
                          </div>
                        </TableCell>
                        {shows("status") && (
                          <TableCell className="hidden md:table-cell">
                            <StatusBadge
                              label={status?.label ?? row.status}
                              color={status?.color}
                            />
                          </TableCell>
                        )}
                        {shows("domain") && (
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {row.domain ?? "—"}
                          </TableCell>
                        )}
                        {shows("industry") && (
                          <TableCell className="hidden md:table-cell">
                            {row.industry ?? "—"}
                          </TableCell>
                        )}
                        {shows("contacts") && (
                          <TableCell className="pr-4 text-right tabular-nums sm:pr-2">
                            {row.contactCount}
                          </TableCell>
                        )}
                        {shows("activity") && (
                          <TableCell className="hidden text-right sm:table-cell">
                            {row.lastActivityAt
                              ? formatDate(dateIn(timezone, row.lastActivityAt))
                              : "—"}
                          </TableCell>
                        )}
                      </ClickableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ListCard>

            <ListFooter
              first={(pageNumber - 1) * PAGE_SIZE + 1}
              shown={page.rows.length}
              total={page.total}
            >
              {(pageNumber > 1 || page.hasMore) && (
                <nav aria-label="Pages" className="flex gap-4">
                  {pageNumber > 1 && (
                    <Link
                      href={companiesHref(params, {
                        ...NO_PANEL,
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={companiesHref(params, {
                        ...NO_PANEL,
                        page: pageNumber + 1,
                      })}
                      className="underline"
                    >
                      Next page
                    </Link>
                  )}
                </nav>
              )}
            </ListFooter>
          </Selection>
        )}
      </div>

      {open && (
        <RecordSheet
          closeHref={companiesHref(params, NO_PANEL)}
          recordKey={
            params.fields
              ? "fields"
              : entry
                ? entryKey(entry)
                : contact && params.merge
                  ? `merge:${params.merge}`
                  : (contact?.id ?? open.id)
          }
          narrow={Boolean(params.fields || (contact && params.merge))}
        >
          {params.fields ? (
            <FieldsPanel
              ownerId={owner.id}
              tab={params.fields}
              back={{
                href: companiesHref(params, { fields: undefined }),
                label: `Back to ${contact?.fullName ?? open.name}`,
              }}
              hrefFor={(fields) => companiesHref(params, { fields })}
            />
          ) : entry ? (
            <EntryPanel
              ownerId={owner.id}
              entry={entry}
              contact={contact}
              organization={open}
              back={{
                href: companiesHref(params, {
                  ...NO_ENTRY,
                  tab: entryTab(entry),
                  after: undefined,
                }),
                label: `Back to ${contact?.fullName ?? open.name}`,
              }}
            />
          ) : contact && params.merge ? (
            <MergePanel
              ownerId={owner.id}
              keepId={contact.id}
              otherId={params.merge}
              back={{
                href: companiesHref(params, { merge: undefined }),
                label: `Back to ${contact.fullName}`,
              }}
              // Inside the company only while both are at it; else over the people list.
              swapHref={(keep, other, here) =>
                here
                  ? companiesHref(params, { contact: keep, merge: other })
                  : `${contactHref(keep)}&merge=${other}`
              }
              company={open.id}
            />
          ) : contact ? (
            <ContactPanel
              ownerId={owner.id}
              contact={contact}
              inside={{
                id: open.id,
                href: companiesHref(params, NO_CONTACT),
                back: {
                  href: companiesHref(params, { ...NO_CONTACT, tab: "contacts" }),
                  label: `Back to ${open.name}`,
                },
              }}
              // A company's own "contacts" tab means nothing for one person.
              tab={params.tab === "contacts" ? undefined : params.tab}
              after={params.after}
              hrefFor={({ tab, after }) => companiesHref(params, { tab, after })}
              entryHref={(change) => companiesHref(params, change)}
              fieldsHref={companiesHref(params, { fields: "contacts" })}
            />
          ) : (
            <CompanyPanel
              ownerId={owner.id}
              organization={open}
              statuses={statuses}
              params={{ ...params, contact: undefined }}
            />
          )}
        </RecordSheet>
      )}
    </div>
  );
}
