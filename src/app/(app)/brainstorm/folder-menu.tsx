"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteBrainstormFolderAction, renameBrainstormFolderAction } from "./actions";
import { NameForm } from "./name-form";

// Rename and Delete for a folder, on its card and at the top of the folder.
export function FolderMenu({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const [open, setOpen] = useState<"rename" | "delete" | null>(null);
  const close = (isOpen: boolean) => !isOpen && setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for folder ${name}`}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <MoreVertical aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuItem onClick={() => setOpen("rename")}>
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setOpen("delete")}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "rename"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>The boards inside stay where they are.</DialogDescription>
          </DialogHeader>
          <NameForm
            action={renameBrainstormFolderAction.bind(null, id)}
            name={name}
            submitLabel="Save"
            onDone={() => setOpen(null)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the folder {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the folder goes. The boards inside are kept and move back to
              Brainstorming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteBrainstormFolderAction}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Delete folder
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
