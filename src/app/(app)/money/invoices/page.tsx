import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import { invoiceCurrencies, listInvoices } from "@/modules/invoices/queries";
import {
  INVOICE_SORTS,
  invoiceListParams,
  type InvoiceListParams,
  type InvoiceSort,
} from "@/modules/invoices/schema";
import { getOrganization } from "@/modules/organizations/queries";
import { ListCard, ListFooter } from "../../people/(lists)/list-card";
import { ListToolbar } from "../../people/(lists)/list-toolbar";
import { SortHead } from "../../people/(lists)/sort-head";
import { invoiceHref, invoicesHref, invoiceStatusOptions, newInvoiceHref } from "./labels";
import { InvoiceStatusPill } from "./status-pill";

export const metadata: Metadata = { title: "Invoices" };

const PAGE_SIZE = 50;
const SORT_LABELS: Record<InvoiceSort, string> = {
  number: "Number",
  issued: "Issued",
  due: "Due",
  total: "Total",
};
// The latest and largest come first; numbers run in order.
const FIRST_DIRECTION = { number: "asc", issued: "desc", due: "desc", total: "desc" } as const;
const FIRST_PAGE = { page: undefined };

function sorting(params: InvoiceListParams, sort: InvoiceSort) {
  const current = (params.sort ?? "issued") === sort;
  const dir = params.dir ?? FIRST_DIRECTION[sort];
  const next = current ? (dir === "asc" ? "desc" : "asc") : FIRST_DIRECTION[sort];
  return {
    label: SORT_LABELS[sort],
    current: current ? dir : null,
    href: invoicesHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

// The list can be narrowed to one client from their Money tab or a figure that
// counts them; the name is shown only once the record is found to be the owner's.
async function clientOf(ownerId: string, params: InvoiceListParams) {
  if (params.company) {
    const organization = await getOrganization(ownerId, params.company);
    return organization ? { name: organization.name, organizationId: params.company } : null;
  }
  if (params.person) {
    const contact = await getContact(ownerId, params.person);
    return contact ? { name: contact.fullName, contactId: params.person } : null;
  }
  return null;
}

export default async function InvoicesPage({ searchParams }: PageProps<"/money/invoices">) {
  const owner = await requireOwner();
  const params = invoiceListParams.parse(await searchParams);
  const sort = params.sort ?? "issued";
  const pageNumber = params.page ?? 1;
  const [page, currencies, client] = await Promise.all([
    listInvoices(owner.id, {
      q: params.q,
      status: params.status,
      currency: params.currency,
      organizationId: params.company,
      contactId: params.person,
      sort,
      dir: params.dir ?? FIRST_DIRECTION[sort],
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    invoiceCurrencies(owner.id),
    clientOf(owner.id, params),
  ]);
  const filtered = Boolean(
    params.q || params.status || params.currency || params.company || params.person,
  );
  const filters = [
    {
      label: "Status",
      value: params.status ?? "",
      options: [
        {
          value: "",
          label: "All statuses",
          href: invoicesHref(params, { ...FIRST_PAGE, status: undefined }),
        },
        ...invoiceStatusOptions.map(({ value, label }) => ({
          value,
          label,
          href: invoicesHref(params, { ...FIRST_PAGE, status: value }),
        })),
      ],
    },
    // Offered once there is more than one to choose between.
    ...(currencies.length > 1
      ? [
          {
            label: "Currency",
            value: params.currency ?? "",
            options: [
              {
                value: "",
                label: "All currencies",
                href: invoicesHref(params, { ...FIRST_PAGE, currency: undefined }),
              },
              ...currencies.map((currency) => ({
                value: currency,
                label: currency,
                href: invoicesHref(params, { ...FIRST_PAGE, currency }),
              })),
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            A record of each invoice you send, with the file you exported.
          </p>
        </div>
        <ButtonLink href={newInvoiceHref(client ?? undefined)}>
          <Plus aria-hidden />
          New invoice
        </ButtonLink>
      </div>

      <div className="grid gap-4">
        <ListToolbar
          path="/money/invoices"
          search={{
            label: "Search invoices by number or client",
            placeholder: "Search by number or client…",
            value: params.q,
          }}
          keep={{
            status: params.status,
            currency: params.currency,
            company: params.company,
            person: params.person,
            sort: params.sort,
            dir: params.dir,
          }}
          filters={filters}
          sorts={INVOICE_SORTS.map((column) => sorting(params, column))}
        />

        {client && (
          <p className="text-sm">
            Invoices for <span className="font-medium">{client.name}</span>.{" "}
            <Link
              href={invoicesHref(params, { ...FIRST_PAGE, company: undefined, person: undefined })}
              className="underline"
            >
              Show every client
            </Link>
          </p>
        )}

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No invoices match these filters."
              : "No invoices yet. Record one you have sent, with the PDF you exported from Figma."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead {...sorting(params, "number")} />
                    <TableHead className="hidden sm:table-cell">Client</TableHead>
                    <SortHead {...sorting(params, "issued")} className="hidden md:table-cell" />
                    <SortHead {...sorting(params, "due")} className="hidden md:table-cell" />
                    <SortHead {...sorting(params, "total")} className="text-right" />
                    <TableHead className="pr-4 sm:pr-2">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = invoiceHref(row.id);
                    return (
                      <ClickableRow key={row.id} href={href}>
                        <TableCell className="whitespace-normal">
                          <div className="grid gap-1">
                            <Link
                              href={href}
                              className="font-medium break-words underline-offset-4 hover:underline"
                            >
                              {row.number}
                            </Link>
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {row.clientName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-56 sm:table-cell">
                          <span className="flex min-w-0 items-center gap-2">
                            {row.organizationId ? (
                              <CompanyLogo
                                id={row.organizationId}
                                name={row.clientName}
                                logoVersion={row.logoVersion}
                                className="size-6 text-[0.625rem]"
                              />
                            ) : (
                              <ContactAvatar
                                id={row.contactId!}
                                name={row.clientName}
                                photoVersion={row.photoVersion}
                                className="size-6 text-[0.625rem]"
                              />
                            )}
                            <span className="truncate">{row.clientName}</span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {formatDate(row.issueDate)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {formatDate(row.dueDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(row.total, row.currency)}
                        </TableCell>
                        <TableCell className="pr-4 sm:pr-2">
                          <InvoiceStatusPill status={row.status} />
                        </TableCell>
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
                      href={invoicesHref(params, {
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={invoicesHref(params, { page: pageNumber + 1 })}
                      className="underline"
                    >
                      Next page
                    </Link>
                  )}
                </nav>
              )}
            </ListFooter>
          </>
        )}
      </div>
    </div>
  );
}
