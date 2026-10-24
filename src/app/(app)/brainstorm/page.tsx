import type { Metadata } from "next";
import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
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
import { listBrainstorms } from "@/modules/brainstorm/queries";
import {
  BRAINSTORM_PAGE_SIZE,
  brainstormListParams,
  type BrainstormListParams,
} from "@/modules/brainstorm/schema";
import { getSettings } from "@/modules/settings/service";
import { ListCard, ListFooter } from "../people/(lists)/list-card";
import { ListToolbar } from "../people/(lists)/list-toolbar";
import { IconPicker } from "../workflows/icon-picker";
import { setBrainstormIconAction } from "./actions";
import { NewBrainstorm } from "./name-form";

export const metadata: Metadata = { title: "Brainstorming" };

function pageHref({ q }: BrainstormListParams, page?: number) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (page && page > 1) search.set("page", String(page));
  const query = search.toString();
  return `/brainstorm${query ? `?${query}` : ""}`;
}

export default async function BrainstormPage({
  searchParams,
}: PageProps<"/brainstorm">) {
  const owner = await requireOwner();
  const params = brainstormListParams.parse(await searchParams);
  const pageNumber = params.page ?? 1;
  const [page, settings] = await Promise.all([
    listBrainstorms(owner.id, {
      q: params.q,
      offset: (pageNumber - 1) * BRAINSTORM_PAGE_SIZE,
    }),
    getSettings(owner.id),
  ]);
  const timezone = settings?.timezone ?? "UTC";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Brainstorming</h1>
          <p className="text-muted-foreground">
            Whiteboards of your own for notes, sketches and ideas, apart from any
            client.
          </p>
        </div>
        <NewBrainstorm />
      </div>

      <div className="grid gap-4">
        <ListToolbar
          path="/brainstorm"
          search={{
            label: "Search boards by name",
            placeholder: "Search boards by name…",
            value: params.q,
          }}
          keep={{}}
          filters={[]}
        />

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {params.q
              ? "No boards match that name."
              : "No boards yet. Start one to jot down ideas, draw and stick notes."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <span className="sr-only">Icon</span>
                    </TableHead>
                    <TableHead>Board</TableHead>
                    <TableHead className="pr-4 text-right sm:pr-2">Last edited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = `/brainstorm/${row.id}`;
                    return (
                      <ClickableRow key={row.id} href={href}>
                        <TableCell>
                          <IconPicker
                            name={row.name}
                            icon={row.icon}
                            action={setBrainstormIconAction.bind(null, row.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <Link
                            href={href}
                            className="font-medium break-words underline-offset-4 hover:underline"
                          >
                            {row.name}
                          </Link>
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
              first={(pageNumber - 1) * BRAINSTORM_PAGE_SIZE + 1}
              shown={page.rows.length}
              total={page.total}
            >
              {(pageNumber > 1 || page.hasMore) && (
                <nav aria-label="Pages" className="flex gap-4">
                  {pageNumber > 1 && (
                    <Link href={pageHref(params, pageNumber - 1)} className="underline">
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link href={pageHref(params, pageNumber + 1)} className="underline">
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
