import { ArrowDown, ArrowDownUp, ArrowUp, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
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
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import {
  listEngagementCompanies,
  listEngagements,
} from "@/modules/engagements/queries";
import {
  ENGAGEMENT_SORTS,
  engagementListParams,
  type EngagementListParams,
} from "@/modules/engagements/schema";
import { ListCard, ListFooter } from "../people/(lists)/list-card";
import { ListToolbar } from "../people/(lists)/list-toolbar";
import { DateText, EngagementStatusBadge } from "./engagement-bits";
import { engagementHref, engagementStatusOptions, workHref } from "./labels";

export const metadata: Metadata = { title: "Work" };

const PAGE_SIZE = 50;
type Sort = (typeof ENGAGEMENT_SORTS)[number];
const SORT_LABELS: Record<Sort, string> = {
  title: "Engagement",
  status: "Status",
  start: "Start",
  end: "Target end",
};
// Status runs from active work to cancelled work; dates start with the latest.
const FIRST_DIRECTION = {
  title: "asc",
  status: "asc",
  start: "desc",
  end: "asc",
} as const;
const FIRST_PAGE = { page: undefined };

function sorting(params: EngagementListParams, sort: Sort) {
  const current = (params.sort ?? "status") === sort;
  const dir = params.dir ?? FIRST_DIRECTION[sort];
  const next = current
    ? dir === "asc"
      ? "desc"
      : "asc"
    : FIRST_DIRECTION[sort];
  return {
    current: current ? dir : null,
    href: workHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

function SortHead({
  params,
  sort,
  className,
}: {
  params: EngagementListParams;
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

export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const owner = await requireOwner();
  const typed = engagementListParams.parse(await searchParams);
  const companies = await listEngagementCompanies(owner.id);
  // A company that has no work, or is not the owner's, narrows nothing.
  const params = {
    ...typed,
    company: companies.some(({ id }) => id === typed.company)
      ? typed.company
      : undefined,
  };
  const sort = params.sort ?? "status";
  const pageNumber = params.page ?? 1;
  const page = await listEngagements(owner.id, {
    q: params.q,
    status: params.status,
    organizationId: params.company,
    sort,
    dir: params.dir ?? FIRST_DIRECTION[sort],
    limit: PAGE_SIZE,
    offset: (pageNumber - 1) * PAGE_SIZE,
  });
  const filtered = Boolean(params.q || params.status || params.company);
  const filters = [
    {
      label: "Status",
      value: params.status ?? "",
      options: [
        {
          value: "",
          label: "All statuses",
          href: workHref(params, { ...FIRST_PAGE, status: undefined }),
        },
        ...engagementStatusOptions.map(({ value, label, color }) => ({
          value,
          label,
          color,
          href: workHref(params, { ...FIRST_PAGE, status: value }),
        })),
      ],
    },
    ...(companies.length > 1
      ? [
          {
            label: "Company",
            value: params.company ?? "",
            options: [
              {
                value: "",
                label: "All companies",
                href: workHref(params, { ...FIRST_PAGE, company: undefined }),
              },
              ...companies.map(({ id, name }) => ({
                value: id,
                label: name,
                href: workHref(params, { ...FIRST_PAGE, company: id }),
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
          <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
          <p className="text-muted-foreground">
            The paid work you have agreed with your clients.
          </p>
        </div>
        <ButtonLink href="/work/new">
          <Plus aria-hidden />
          New engagement
        </ButtonLink>
      </div>

      <div className="grid gap-4">
        <ListToolbar
          path="/work"
          search={{
            label: "Search engagements by title",
            placeholder: "Search engagements by title…",
            value: params.q,
          }}
          keep={{
            status: params.status,
            company: params.company,
            sort: params.sort,
            dir: params.dir,
          }}
          filters={filters}
          sorts={ENGAGEMENT_SORTS.map((column) => ({
            label: SORT_LABELS[column],
            ...sorting(params, column),
          }))}
        />

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No engagements match these filters."
              : "No engagements yet. Add one when a client agrees to paid work."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead params={params} sort="title" />
                    <TableHead className="hidden sm:table-cell">Company</TableHead>
                    <SortHead
                      params={params}
                      sort="status"
                      className="hidden md:table-cell"
                    />
                    <SortHead
                      params={params}
                      sort="start"
                      className="hidden lg:table-cell"
                    />
                    <SortHead
                      params={params}
                      sort="end"
                      className="hidden lg:table-cell"
                    />
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = engagementHref(row.id);
                    return (
                      <ClickableRow key={row.id} href={href}>
                        <TableCell className="whitespace-normal">
                          <div className="grid gap-1">
                            <Link
                              href={href}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {row.title}
                            </Link>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:hidden">
                              <span>{row.organizationName}</span>
                              <EngagementStatusBadge status={row.status} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-normal sm:table-cell">
                          <div className="flex items-center gap-2">
                            <CompanyLogo
                              id={row.organizationId}
                              name={row.organizationName}
                              logoVersion={row.logoVersion}
                              className="size-6 text-[10px]"
                            />
                            {row.organizationName}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <EngagementStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <DateText date={row.startDate} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <DateText date={row.targetEndDate} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.valueMinor === null
                            ? "—"
                            : formatMoney(row.valueMinor, row.currency)}
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
                      href={workHref(params, {
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={workHref(params, { page: pageNumber + 1 })}
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
