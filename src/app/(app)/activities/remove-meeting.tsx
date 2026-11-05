"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { removeMeetingAction } from "../meetings/actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

// A meeting that has ended, deleted from its card. Google Calendar keeps it.
export function RemoveMeeting({
  id,
  title,
  label,
  hasNotes,
  fileCount,
}: {
  id: string;
  title: string;
  label: string;
  hasNotes: boolean;
  fileCount: number;
}) {
  const [open, setOpen] = useState(false);
  const kept = [
    hasNotes && "notes",
    fileCount > 0 && (fileCount === 1 ? "1 file" : `${fileCount} files`),
  ].filter(Boolean);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <X aria-hidden />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <form action={removeMeetingAction} className="grid gap-4">
            <input type="hidden" name="id" value={id} />
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">Delete {title}?</AlertDialogTitle>
              <AlertDialogDescription>
                It goes from Touchpoint and stays on your Google Calendar.
                {kept.length > 0 &&
                  ` Its ${kept.join(" and ")} ${hasNotes || fileCount > 1 ? "are" : "is"} deleted too.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Keep</AlertDialogCancel>
              <DeleteButton />
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
