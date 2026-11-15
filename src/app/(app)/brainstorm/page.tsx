import type { Metadata } from "next";
import { ArrowLeft, FolderOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { dateIn, formatDate } from "@/lib/time";
import {
  getBrainstormFolder,
  listBrainstormFolders,
  listBrainstorms,
} from "@/modules/brainstorm/queries";
import {
  BRAINSTORM_PAGE_SIZE,
  brainstormListParams,
  type BrainstormListParams,
} from "@/modules/brainstorm/schema";
import { getSettings } from "@/modules/settings/service";
import { ListFooter } from "../people/(lists)/list-card";
import { ListToolbar } from "../people/(lists)/list-toolbar";
import { BrainstormList } from "./brainstorm-list";
import { FolderMenu } from "./folder-menu";
import { NewBrainstorm, NewFolder } from "./name-form";

export const metadata: Metadata = { title: "Brainstorming" };

function pageHref({ q, folder }: BrainstormListParams, page?: number) {
  const search = new URLSearchParams();
  if (folder) search.set("folder", folder);
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
  const [page, folders, folder, settings] = await Promise.all([
    listBrainstorms(owner.id, {
      q: params.q,
      folder: params.folder,
      offset: (pageNumber - 1) * BRAINSTORM_PAGE_SIZE,
    }),
    listBrainstormFolders(owner.id),
    params.folder ? getBrainstormFolder(owner.id, params.folder) : null,
    getSettings(owner.id),
  ]);
  if (params.folder && !folder) notFound();
  const timezone = settings?.timezone ?? "UTC";
  // Folders are shown on the Brainstorming page itself, filtered by a search too.
  const shownFolders = folder
    ? []
    : params.q
      ? folders.filter(({ name }) => name.toLowerCase().includes(params.q!.toLowerCase()))
      : folders;
  const nothing = page.rows.length === 0 && shownFolders.length === 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {folder ? (
            <>
              <nav aria-label="Breadcrumb">
                <Link
                  href="/brainstorm"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft aria-hidden className="size-4" />
                  Brainstorming
                </Link>
              </nav>
              <div className="flex items-center gap-2">
                <FolderOpen aria-hidden className="size-6 shrink-0 text-amber-600 dark:text-amber-300" />
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
                  {folder.name}
                </h1>
                <FolderMenu id={folder.id} name={folder.name} />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Brainstorming</h1>
              <p className="text-muted-foreground">
                Whiteboards of your own for notes, sketches and ideas, apart from any
                client.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!folder && <NewFolder />}
          <NewBrainstorm folder={folder ?? undefined} />
        </div>
      </div>

      <div className="grid gap-4">
        <ListToolbar
          path="/brainstorm"
          search={{
            label: folder ? `Search boards in ${folder.name}` : "Search boards by name",
            placeholder: folder ? `Search ${folder.name}…` : "Search boards and folders…",
            value: params.q,
          }}
          keep={folder ? { folder: folder.id } : {}}
          filters={[]}
        />

        {nothing ? (
          <p className="text-sm text-muted-foreground">
            {params.q
              ? "Nothing matches that name."
              : folder
                ? "No boards in this folder yet. Make one here, or drag a board onto this folder from Brainstorming."
                : "No boards yet. Start one to jot down ideas, draw and stick notes."}
          </p>
        ) : (
          <>
            <BrainstormList
              key={[
                ...page.rows.map(({ id, folderId }) => `${id}:${folderId}`).sort(),
                ...shownFolders.map(({ id, boards }) => `${id}:${boards}`),
              ].join()}
              folders={shownFolders}
              inFolder={folder}
              moveTargets={folders.map(({ id, name }) => ({ id, name }))}
              showFolder={!folder && Boolean(params.q)}
              emptyBoards={
                params.q
                  ? "No boards match that name."
                  : "Every board is in a folder. Drag one out of its folder to keep it here."
              }
              boards={page.rows.map(({ id, name, icon, updatedAt, folderId, folderName }) => ({
                id,
                name,
                icon,
                edited: formatDate(dateIn(timezone, updatedAt)),
                folder: folderId && folderName ? { id: folderId, name: folderName } : null,
              }))}
            />

            {page.rows.length > 0 && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
