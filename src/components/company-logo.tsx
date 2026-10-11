import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export function CompanyLogo({
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
