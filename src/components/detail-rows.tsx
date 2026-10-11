import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SECTION_HEADING =
  "text-xs font-medium tracking-wide text-muted-foreground uppercase";

// `note` is shown under a value that is there, such as where it came from.
export type DetailRow = { label: string; value: ReactNode; note?: ReactNode };

// Every row is listed, with a dash where there is nothing yet.
export function DetailRows({
  rows,
  columns = 1,
  className,
}: {
  rows: DetailRow[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-8 gap-y-3 text-sm",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium break-words">
            {row.value || (
              <span className="font-normal text-muted-foreground">—</span>
            )}
            {row.value && row.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}
