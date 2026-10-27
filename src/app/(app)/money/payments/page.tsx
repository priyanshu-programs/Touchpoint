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
import { getOrganization } from "@/modules/organizations/queries";
import { listPayments, paymentCurrencies } from "@/modules/payments/queries";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_SORTS,
  paymentListParams,
  type PaymentListParams,
  type PaymentSort,
} from "@/modules/payments/schema";
import { ListCard, ListFooter } from "../../people/(lists)/list-card";
import { ListToolbar } from "../../people/(lists)/list-toolbar";
import { SortHead } from "../../people/(lists)/sort-head";
import { MoneyHeader } from "../money-header";
import { newPaymentHref, paymentHref, paymentsHref } from "./labels";

export const metadata: Metadata = { title: "Payments" };

const PAGE_SIZE = 50;
const SORT_LABELS: Record<PaymentSort, string> = { received: "Received", amount: "Amount" };
const FIRST_PAGE = { page: undefined };

// The latest and largest come first.
function sorting(params: PaymentListParams, sort: PaymentSort) {
  const current = (params.sort ?? "received") === sort;
  const dir = params.dir ?? "desc";
  const next = current ? (dir === "asc" ? "desc" : "asc") : "desc";
  return {
    label: SORT_LABELS[sort],
    current: current ? dir : null,
    href: paymentsHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

// Narrowed to one client from their tab; the name is shown only once the record is
// found to be the owner's.
async function clientOf(ownerId: string, params: PaymentListParams) {
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

export default async function PaymentsPage({ searchParams }: PageProps<"/money/payments">) {
  const owner = await requireOwner();
  const params = paymentListParams.parse(await searchParams);
  const pageNumber = params.page ?? 1;
  const [page, currencies, client] = await Promise.all([
    listPayments(owner.id, {
      q: params.q,
      currency: params.currency,
      organizationId: params.company,
      contactId: params.person,
      sort: params.sort,
      dir: params.dir,
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    paymentCurrencies(owner.id),
    clientOf(owner.id, params),
  ]);
  const filtered = Boolean(params.q || params.currency || params.company || params.person);
  // Offered once there is more than one to choose between.
  const filters =
    currencies.length > 1
      ? [
          {
            label: "Currency",
            value: params.currency ?? "",
            options: [
              {
                value: "",
                label: "All currencies",
                href: paymentsHref(params, { ...FIRST_PAGE, currency: undefined }),
              },
              ...currencies.map((currency) => ({
                value: currency,
                label: currency,
                href: paymentsHref(params, { ...FIRST_PAGE, currency }),
              })),
            ],
          },
        ]
      : [];

  return (
    <div className="grid gap-6">
      <MoneyHeader
        title="Payments"
        subtitle="The money you have received, and the invoices it paid."
        action={
          <ButtonLink href={newPaymentHref(client ?? undefined)}>
            <Plus aria-hidden />
            Record payment
          </ButtonLink>
        }
      />

      <div className="grid gap-4">
        <ListToolbar
          path="/money/payments"
          search={{
            label: "Search payments by client or reference",
            placeholder: "Search by client or reference…",
            value: params.q,
          }}
          keep={{
            currency: params.currency,
            company: params.company,
            person: params.person,
            sort: params.sort,
            dir: params.dir,
          }}
          filters={filters}
          sorts={PAYMENT_SORTS.map((column) => sorting(params, column))}
        />

        {client && (
          <p className="text-sm">
            Payments from <span className="font-medium">{client.name}</span>.{" "}
            <Link
              href={paymentsHref(params, { ...FIRST_PAGE, company: undefined, person: undefined })}
              className="underline"
            >
              Show every client
            </Link>
          </p>
        )}

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No payments match these filters."
              : "No payments yet. Record one when a client pays you."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead {...sorting(params, "received")} />
                    <TableHead className="hidden sm:table-cell">Client</TableHead>
                    <TableHead className="hidden md:table-cell">Method</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <SortHead {...sorting(params, "amount")} className="pr-4 text-right sm:pr-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = paymentHref(row.id);
                    const unallocated = row.amountMinor - row.allocated;
                    return (
                      <ClickableRow key={row.id} href={href}>
                        <TableCell className="whitespace-normal">
                          <div className="grid gap-1">
                            <Link
                              href={href}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {formatDate(row.receivedOn)}
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
                          {PAYMENT_METHOD_LABELS[row.method]}
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">
                          {row.reference ?? "—"}
                        </TableCell>
                        <TableCell className="pr-4 text-right sm:pr-2">
                          <div className="grid gap-0.5">
                            <span className="font-medium tabular-nums">
                              {formatMoney(row.amountMinor, row.currency)}
                            </span>
                            {unallocated > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatMoney(unallocated, row.currency)} unallocated
                              </span>
                            )}
                          </div>
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
                      href={paymentsHref(params, {
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={paymentsHref(params, { page: pageNumber + 1 })}
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
