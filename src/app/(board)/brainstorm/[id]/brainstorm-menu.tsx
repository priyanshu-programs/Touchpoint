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
import {
  deleteBrainstormAction,
  renameBrainstormAction,
} from "@/app/(app)/brainstorm/actions";
import { NameForm } from "@/app/(app)/brainstorm/name-form";

export function BrainstormMenu({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState<"rename" | "delete" | null>(null);
  const close = (isOpen: boolean) => !isOpen && setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Board actions"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
            <DialogTitle>Rename board</DialogTitle>
            <DialogDescription>The drawing stays as it is.</DialogDescription>
          </DialogHeader>
          <NameForm
            action={renameBrainstormAction.bind(null, id)}
            name={name}
            submitLabel="Save"
            onDone={() => setOpen(null)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The board and everything drawn on it are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteBrainstormAction}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Delete board
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
