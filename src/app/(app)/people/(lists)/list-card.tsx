import type { ReactNode } from "react";

// The frame a list's table sits in: rounded, with a band behind the column names and
// room at both ends of every row.
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card [&_td]:py-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:font-normal [&_th]:text-muted-foreground [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_thead]:bg-muted/50">
      {children}
    </div>
  );
}

// "Showing 1–50 of 132" under a list, with the way to its other pages beside it.
export function ListFooter({
  first,
  shown,
  total,
  children,
}: {
  // Where this page starts; left out when the list cannot say (it pages by a cursor).
  first?: number;
  shown: number;
  total: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p>
        Showing {first ? `${first}–${first + shown - 1}` : shown} of {total}
      </p>
      {children}
    </div>
  );
}
