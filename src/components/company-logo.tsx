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
