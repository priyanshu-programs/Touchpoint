"use client";

import { Download, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import { DOWNLOAD_MESSAGES, downloadVoiceNotes } from "./voice-download";

export function BrainstormMenu({
  id,
  name,
  voiceNotes,
}: {
  id: string;
  name: string;
  // How many voice notes the board kept when the page was loaded.
  voiceNotes: number;
}) {
  const [open, setOpen] = useState<"rename" | "delete" | "voice" | null>(null);
  const close = (isOpen: boolean) => !isOpen && setOpen(null);
  const [downloading, setDownloading] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);

  // Saves the zip, or says why it could not; in a dialog of its own when asked
  // from the menu, which closes as it is clicked.
  const download = async (from: "menu" | "delete") => {
    setDownloading(true);
    setVoiceMessage(null);
    const outcome = await downloadVoiceNotes(id);
    setDownloading(false);
    if (outcome === "saved") return;
    setVoiceMessage(DOWNLOAD_MESSAGES[outcome]);
    if (from === "menu") setOpen("voice");
  };

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
          <DropdownMenuItem disabled={downloading} onClick={() => void download("menu")}>
            <Download aria-hidden />
            Download voice notes
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
              {voiceNotes > 0 &&
                ` That includes its ${voiceNotes === 1 ? "voice note" : `${voiceNotes} voice notes`}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {voiceNotes > 0 && (
            <div className="grid justify-items-start gap-1 text-sm">
              <button
                type="button"
                disabled={downloading}
                onClick={() => void download("delete")}
                className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Download aria-hidden className="size-4" />
                )}
                Download voice notes first
              </button>
              {voiceMessage && <p role="alert">{voiceMessage}</p>}
            </div>
          )}
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

      <Dialog open={open === "voice"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download voice notes</DialogTitle>
            <DialogDescription>{voiceMessage}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
