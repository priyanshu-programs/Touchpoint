import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export function CompanyLogo({
  id,
  name,
  logoVersion,
  className,
}: {
  id: string;
  name: string;
  logoVersion: string | null;
  className?: string;
}) {
  if (logoVersion) {
    return (
      // Served per owner behind the session, which the image optimizer could not fetch.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/organizations/${id}/logo?v=${logoVersion}`}
        alt=""
        className={cn(
          "size-7 shrink-0 rounded-md bg-white object-contain",
          className,
        )}
      />
    );
  }
  return <Monogram name={name} className={className} />;
}

// Served per owner behind the session, as logos are; the version lets it be cached for good.
export const contactPhotoSrc = (id: string, photoVersion: string) =>
  `/api/contacts/${id}/photo?v=${photoVersion}`;

// A person's picture from their company's website, or their initials.
export function ContactAvatar({
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
  if (photoVersion) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contactPhotoSrc(id, photoVersion)}
        alt=""
        className={cn(
          "size-7 shrink-0 rounded-full bg-muted object-cover",
          className,
        )}
      />
    );
  }
  return <Monogram name={name} className={cn("rounded-full", className)} />;
}

export function Monogram({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
