"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";
import {
  saveProfileAction,
  signOutAction,
} from "@/app/(app)/settings/actions";
import { TextField } from "@/components/fields";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ProfileValues = {
  email: string;
  name: string;
  preferredName: string;
  jobTitle: string;
  businessName: string;
  phone: string;
  website: string;
  location: string;
};

function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, formAction, pending] = useActionState(saveProfileAction, null);
  const values = state?.values ?? profile;

  return (
    <form
      key={JSON.stringify(values)}
      action={formAction}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
        <TextField
          name="name"
          label="Full name *"
          defaultValue={values.name}
          maxLength={100}
          autoComplete="name"
          required
        />
        <TextField
          name="preferredName"
          label="You want to be referred to as *"
          hint="The name Touchpoint greets you by, at the top left."
          defaultValue={values.preferredName}
          maxLength={60}
          autoComplete="nickname"
          required
        />
        <div className="grid gap-2 text-sm">
          <p className="font-medium">Email</p>
          <p className="break-all">{profile.email}</p>
          <p className="text-muted-foreground">
            You sign in with this address, so it can&apos;t be changed here.
          </p>
        </div>
        <TextField
          name="jobTitle"
          label="Job title (optional)"
          defaultValue={values.jobTitle}
          maxLength={100}
          autoComplete="organization-title"
        />
        <TextField
          name="businessName"
          label="Business name (optional)"
          defaultValue={values.businessName}
          maxLength={120}
          autoComplete="organization"
        />
        <TextField
          name="phone"
          label="Phone (optional)"
          type="tel"
          defaultValue={values.phone}
          maxLength={40}
          autoComplete="tel"
        />
        <TextField
          name="website"
          label="Website (optional)"
          placeholder="https://"
          defaultValue={values.website}
          maxLength={2000}
          autoComplete="url"
        />
        <TextField
          name="location"
          label="Location (optional)"
          defaultValue={values.location}
          maxLength={120}
        />
        <FormMessage state={state} />
      </div>
      <SheetFooter className="mt-0 border-t">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void signOutAction()}
        >
          <LogOut aria-hidden />
          Sign out
        </Button>
      </SheetFooter>
    </form>
  );
}

export function ProfilePanel({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileValues;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>Your profile</SheetTitle>
          <SheetDescription>Fields marked * are required.</SheetDescription>
        </SheetHeader>
        <ProfileForm profile={profile} />
      </SheetContent>
    </Sheet>
  );
}
