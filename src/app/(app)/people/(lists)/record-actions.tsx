"use client";

import { Archive, ArchiveRestore, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The three-dots menu of a company or a person: edit, archive, and delete behind a confirmation.
export function RecordActions({
  id,
  editHref,
  archived,
  archiveAction,
  remove,
}: {
  id: string;
  editHref: string;
  archived: boolean;
  archiveAction: (formData: FormData) => Promise<void>;
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
  const [confirming, setConfirming] = useState(false);

  function toggleArchived() {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("archived", archived ? "0" : "1");
    void archiveAction(formData);
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
          <DropdownMenuItem onClick={toggleArchived}>
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
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
