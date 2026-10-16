import { ArrowDown, ArrowDownUp, ArrowUp, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import { Badge } from "@/components/ui/badge";
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
import { listMaterials } from "@/modules/materials/queries";
import {
  MATERIAL_SORTS,
  MATERIAL_TYPE_LABELS,
  materialListParams,
  type MaterialListParams,
} from "@/modules/materials/schema";
import { getSettings } from "@/modules/settings/service";
import { ListCard, ListFooter } from "../people/(lists)/list-card";
import { ListToolbar } from "../people/(lists)/list-toolbar";
import { materialHref, materialsHref, materialTypeOptions } from "./labels";

export const metadata: Metadata = { title: "Materials" };

const PAGE_SIZE = 50;
type Sort = (typeof MATERIAL_SORTS)[number];
const SORT_LABELS: Record<Sort, string> = {
  name: "Material",
  type: "Type",
  updated: "Updated",
};
// Text runs A to Z when first chosen; the latest change comes first.
const FIRST_DIRECTION = { name: "asc", type: "asc", updated: "desc" } as const;
const FIRST_PAGE = { page: undefined };

function sorting(params: MaterialListParams, sort: Sort) {
  const current = (params.sort ?? "name") === sort;
  const dir = params.dir ?? FIRST_DIRECTION[sort];
  const next = current
    ? dir === "asc"
      ? "desc"
      : "asc"
    : FIRST_DIRECTION[sort];
  return {
    current: current ? dir : null,
    href: materialsHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

function SortHead({
  params,
  sort,
  className,
}: {
  params: MaterialListParams;
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

export default async function MaterialsPage({
  searchParams,
}: PageProps<"/materials">) {
  const owner = await requireOwner();
  const params = materialListParams.parse(await searchParams);
  const sort = params.sort ?? "name";
  const pageNumber = params.page ?? 1;
  const [page, settings] = await Promise.all([
    listMaterials(owner.id, {
      q: params.q,
      type: params.type,
      sort,
      dir: params.dir ?? FIRST_DIRECTION[sort],
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    getSettings(owner.id),
  ]);
  const timezone = settings?.timezone ?? "UTC";
  const filtered = Boolean(params.q || params.type);
  const filters = [
    {
      label: "Type",
      value: params.type ?? "",
      options: [
        {
          value: "",
          label: "All types",
          href: materialsHref(params, { ...FIRST_PAGE, type: undefined }),
        },
        ...materialTypeOptions.map(({ value, label }) => ({
          value,
          label,
          href: materialsHref(params, { ...FIRST_PAGE, type: value }),
        })),
      ],
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
          <p className="text-muted-foreground">
            The proposals, decks and links you send to clients, each with its
            versions.
          </p>
        </div>
        <ButtonLink href="/materials/new">
          <Plus aria-hidden />
          New material
        </ButtonLink>
      </div>

      <div className="grid gap-4">
        <ListToolbar
          path="/materials"
          search={{
            label: "Search materials by name",
            placeholder: "Search materials by name…",
            value: params.q,
          }}
          keep={{ type: params.type, sort: params.sort, dir: params.dir }}
          filters={filters}
          sorts={MATERIAL_SORTS.map((column) => ({
            label: SORT_LABELS[column],
            ...sorting(params, column),
          }))}
        />

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No materials match these filters."
              : "No materials yet. Add something you send to clients, such as a proposal or a rate card."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead params={params} sort="name" />
                    <SortHead
                      params={params}
                      sort="type"
                      className="hidden sm:table-cell"
                    />
                    <TableHead className="hidden md:table-cell">
                      Current version
                    </TableHead>
                    <SortHead
                      params={params}
                      sort="updated"
                      className="pr-4 text-right sm:pr-2"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = materialHref(row.id);
                    return (
                      <ClickableRow key={row.id} href={href}>
                        <TableCell className="whitespace-normal">
                          <div className="grid gap-1">
                            <Link
                              href={href}
                              className="font-medium break-words underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </Link>
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {MATERIAL_TYPE_LABELS[row.type]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary">
                            {MATERIAL_TYPE_LABELS[row.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-48 truncate md:table-cell">
                          {row.currentLabel ?? "—"}
                        </TableCell>
                        <TableCell className="pr-4 text-right sm:pr-2">
                          {formatDate(dateIn(timezone, row.updatedAt))}
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
                      href={materialsHref(params, {
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={materialsHref(params, { page: pageNumber + 1 })}
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
