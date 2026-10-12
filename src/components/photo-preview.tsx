"use client";

import { ContactAvatar, contactPhotoSrc } from "@/components/company-logo";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// A person's picture that opens larger when clicked. Initials have nothing more to
// show, so they stay as they are.
export function PhotoPreview({
  id,
  name,
  photoVersion,
  className,
}: {
  id: string;
  name: string;
  photoVersion: string | null;
  className?: string;
}) {
  const avatar = (
    <ContactAvatar
      id={id}
      name={name}
      photoVersion={photoVersion}
      className={className}
    />
  );
  if (!photoVersion) return avatar;

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`View photo of ${name}`}
        className="shrink-0 cursor-zoom-in rounded-full"
      >
        {avatar}
      </DialogTrigger>
      <DialogContent className="w-auto justify-items-center">
        <DialogTitle>{name}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={contactPhotoSrc(id, photoVersion)}
          alt={`Photo of ${name}`}
          className="size-64 max-w-full rounded-lg bg-muted object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
