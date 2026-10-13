"use client";

import { Trash2 } from "lucide-react";
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
import { deleteTemplateAction } from "./actions";

export function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden />
        Delete
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The workflow and its stages are removed for good, and it can no
              longer be started. Workflows already running were copied from it
              and go on as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteTemplateAction}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction
                type="submit"
                variant="destructive"
                className="w-full"
              >
                Delete workflow
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
