import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import Link from "next/link";
import { TableHead } from "@/components/ui/table";

// A column heading that puts the list in order by it; `current` is the direction it is in now.
export function SortHead({
  label,
  current,
  href,
  className,
}: {
  label: string;
  current: "asc" | "desc" | null;
  href: string;
  className?: string;
}) {
  const Icon =
    current === "asc" ? ArrowUp : current === "desc" ? ArrowDown : ArrowDownUp;
  return (
    <TableHead
      aria-sort={
        current ? (current === "asc" ? "ascending" : "descending") : undefined
      }
      className={className}
    >
      <Link
        href={href}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <Icon
          className={current ? "size-3 text-foreground" : "size-3 opacity-50"}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}
