"use client";

import { useActionState, useState } from "react";
import type { RecordFormState } from "@/app/(app)/form-state";
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
import { cancelMeetingAction } from "./actions";

// Two presses: nothing reaches Google until the dialog's own button. A refusal stays in
// the dialog, so the owner reads it where they pressed.
export function CancelMeeting({
  eventId,
  title,
  hasGuests,
  from,
  inside,
  contactId,
}: {
  eventId: string;
  title: string;
  hasGuests: boolean;
  from?: "contact" | "organization";
  inside?: string;
  contactId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RecordFormState, FormData>(
    cancelMeetingAction,
    null,
  );

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel meeting
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <form action={action} className="grid gap-4">
            <input type="hidden" name="eventId" value={eventId} />
            {from && <input type="hidden" name="from" value={from} />}
            {inside && <input type="hidden" name="inside" value={inside} />}
            {contactId && <input type="hidden" name="contactId" value={contactId} />}
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">Cancel {title}?</AlertDialogTitle>
              <AlertDialogDescription>
                {hasGuests
                  ? "It is removed from your Google Calendar and your guests' calendars."
                  : "It is removed from your Google Calendar."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {hasGuests && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="emailGuests"
                  value="yes"
                  defaultChecked
                  className="size-4 accent-primary"
                />
                Email guests that it&apos;s cancelled
              </label>
            )}
            {state && !state.ok && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Keep meeting</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Cancelling…" : "Cancel meeting"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
