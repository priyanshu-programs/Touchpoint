"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteOrganizationAction } from "../../organizations/actions";

export function DeleteCompanyDialog({
  id,
  name,
  contacts,
}: {
  id: string;
  name: string;
  // As the panel counts them: "0", "3", "100+".
  contacts: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The company, its tags, logo and website details are removed for
            good.{" "}
            {contacts === "0"
              ? "Its tasks and logged activity"
              : `Its contacts (${contacts}), tasks and logged activity`}{" "}
            are kept, no longer linked to a company. To hide it instead, use
            Archive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={deleteOrganizationAction}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className="w-full"
            >
              Delete company
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
