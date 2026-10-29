"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
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
import { disconnectGoogleAction, testGoogleConnectionAction } from "./actions";

export function AccountActions({ email }: { email: string }) {
  const [state, test, testing] = useActionState(testGoogleConnectionAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={test}>
          <Button type="submit" variant="outline" size="sm" disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
        </form>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Disconnect
        </Button>
      </div>
      <FormMessage state={state} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Touchpoint gives the access back to Google and stops reading your calendar.
              Your client stays saved, so you can connect again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={disconnectGoogleAction} onSubmit={() => setConfirming(false)}>
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Disconnect
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
