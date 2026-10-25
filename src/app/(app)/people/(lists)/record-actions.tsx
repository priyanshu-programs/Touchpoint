"use client";

import {
  Archive,
  ArchiveRestore,
  ImageOff,
  Merge,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecordSearchDialog, type Search } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The three-dots menu of a record: edit, archive where it can be, and delete behind a confirmation.
export function RecordActions({
  id,
  editHref,
  archived = false,
  archiveAction,
  removePhotoAction,
  merge,
  remove,
}: {
  id: string;
  editHref: string;
  archived?: boolean;
  archiveAction?: (formData: FormData) => Promise<void>;
  // Given when the record has a picture read from a website, which may be the wrong one.
  removePhotoAction?: (formData: FormData) => Promise<void>;
  // Looks for the record to merge into this one, which then opens side by side in the panel.
  merge?: { noun: string; plural: string; search: Search };
  remove: {
    title: string;
    description: string;
    confirmLabel: string;
    action: (formData: FormData) => Promise<void>;
    // Sent with the id, such as where the record was opened from.
    fields?: Record<string, string>;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);

  function toggleArchived() {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("archived", archived ? "0" : "1");
    void archiveAction?.(formData);
  }

  function removePhoto() {
    const formData = new FormData();
    formData.set("id", id);
    void removePhotoAction?.(formData);
  }

  function openMerge(otherId: string) {
    const params = new URLSearchParams(searchParams);
    for (const name of ["tab", "activity", "task", "send", "fields", "earlier"]) {
      params.delete(name);
    }
    params.set("merge", otherId);
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More actions"
          render={<Button variant="outline" size="icon" className="size-7" />}
        >
          <MoreVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuItem onClick={() => router.push(editHref)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          {archiveAction && (
            <DropdownMenuItem onClick={toggleArchived}>
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
          )}
          {removePhotoAction && (
            <DropdownMenuItem onClick={removePhoto}>
              <ImageOff aria-hidden />
              Remove photo
            </DropdownMenuItem>
          )}
          {merge && (
            <DropdownMenuItem onClick={() => setMerging(true)}>
              <Merge aria-hidden />
              Merge with…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {merge && (
        <RecordSearchDialog
          open={merging}
          onOpenChange={setMerging}
          noun={merge.noun}
          plural={merge.plural}
          search={merge.search}
          exclude={[id]}
          onSelect={(option) => openMerge(option.id)}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{remove.title}</AlertDialogTitle>
            <AlertDialogDescription>{remove.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={remove.action}>
              <input type="hidden" name="id" value={id} />
              {Object.entries(remove.fields ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <AlertDialogAction
                type="submit"
                variant="destructive"
                className="w-full"
              >
                {remove.confirmLabel}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
