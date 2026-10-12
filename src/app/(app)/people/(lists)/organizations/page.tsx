import { ArrowDown, ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
} from "@/modules/organizations/queries";
import { ORGANIZATION_STATUSES } from "@/modules/organizations/schema";
import { getSettings } from "@/modules/settings/service";
import { listTags } from "@/modules/tags/queries";
import { labelFor } from "../../labels";
import {
  companiesHref,
  companyListParams,
  type CompanyListParams,
} from "../list-controls";
import { ContactPanel } from "../contact-panel";
import { FieldsPanel } from "../fields-panel";
import { RecordSheet } from "../record-sheet";
import { CompanyPanel } from "./company-panel";
import { NewCompanyDialog } from "./new-company-dialog";

export const metadata: Metadata = { title: "Companies" };

const PAGE_SIZE = 50;
type Sort = NonNullable<CompanyListParams["sort"]>;
// The direction a column takes when it is first chosen: names A to Z, numbers and dates largest first.
const FIRST_DIRECTION = { name: "asc", contacts: "desc", activity: "desc" } as const;
const NO_CONTACT = {
  contact: undefined,
  tab: undefined,
  after: undefined,
  fields: undefined,
};
const NO_PANEL = { ...NO_CONTACT, company: undefined };

function SortHead({
  params,
  sort,
  label,
  className,
}: {
  params: CompanyListParams;
  sort: Sort;
  label: string;
  className?: string;
}) {
  const current = (params.sort ?? "name") === sort;
  const dir = params.dir ?? FIRST_DIRECTION[sort];
  const next = current
    ? dir === "asc"
      ? "desc"
      : "asc"
    : FIRST_DIRECTION[sort];
  return (
    <TableHead
      aria-sort={
        current ? (dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={className}
    >
      <Link
        href={companiesHref(params, {
          ...NO_PANEL,
          sort,
          dir: next,
          page: undefined,
        })}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {current &&
          (dir === "asc" ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          ))}
      </Link>
    </TableHead>
  );
}

export default async function OrganizationsPage({
  searchParams,
}: PageProps<"/people/organizations">) {
  const owner = await requireOwner();
  const params = companyListParams.parse(await searchParams);
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Form
          action="/people/organizations"
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            name="q"
            type="search"
            aria-label="Search companies by name or domain"
            placeholder="Search by name or domain"
            defaultValue={params.q}
            className="w-full sm:w-64"
          />
          {tags.length > 0 && (
            <NativeSelect
              name="tag"
              aria-label="Tag"
              defaultValue={params.tag ?? ""}
            >
              <NativeSelectOption value="">All tags</NativeSelectOption>
              {tags.map((tag) => (
                <NativeSelectOption key={tag.id} value={tag.id}>
                  {tag.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <NativeSelect
            name="status"
            aria-label="Status"
            defaultValue={params.status ?? ""}
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {ORGANIZATION_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {labelFor(status)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={params.archived === "1"}
            />
            Archived
          </label>
          {params.sort && <input type="hidden" name="sort" value={params.sort} />}
          {params.dir && <input type="hidden" name="dir" value={params.dir} />}
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </Form>
        <NewCompanyDialog />
      </div>

      {page.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtered
            ? "No companies match these filters."
            : "No companies yet. Add a company or agency you work with."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead params={params} sort="name" label="Company" />
              <TableHead className="hidden sm:table-cell">Domain</TableHead>
              <TableHead className="hidden md:table-cell">Industry</TableHead>
              <SortHead
                params={params}
                sort="contacts"
                label="Contacts"
                className="text-right"
              />
              <SortHead
                params={params}
                sort="activity"
                label="Last activity"
                className="hidden text-right sm:table-cell"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => {
              const href = companiesHref(params, {
                ...NO_PANEL,
                company: row.id,
              });
              return (
                <ClickableRow key={row.id} href={href}>
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
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {row.domain ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.industry ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.contactCount}
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    {row.lastActivityAt
                      ? formatDate(dateIn(timezone, row.lastActivityAt))
                      : "—"}
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {(pageNumber > 1 || page.hasMore) && (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
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

      {open && (
        <RecordSheet
          closeHref={companiesHref(params, NO_PANEL)}
          recordKey={params.fields ? "fields" : (contact?.id ?? open.id)}
          narrow={Boolean(params.fields)}
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
              fieldsHref={companiesHref(params, { fields: "contacts" })}
            />
          ) : (
            <CompanyPanel
              ownerId={owner.id}
              organization={open}
              params={{ ...params, contact: undefined }}
            />
          )}
        </RecordSheet>
      )}
    </div>
  );
}
