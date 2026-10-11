"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const OWN_CONTROLS = "a, button, input, select, textarea, label";

// A table row that opens its record wherever it is clicked. The name inside stays a
// real link: that is what a keyboard, a middle click and "open in new tab" use.
export function ClickableRow({
  href,
  className,
  ...props
}: ComponentProps<typeof TableRow> & { href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <TableRow
      {...props}
      data-pending={pending || undefined}
      className={cn(
        "cursor-pointer transition-opacity data-pending:opacity-60",
        className,
      )}
      onClick={(event) => {
        // A link or button in the row does its own thing, and dragging to select text is not a click.
        if (
          (event.target as Element).closest(OWN_CONTROLS) ||
          window.getSelection()?.toString()
        ) {
          return;
        }
        startTransition(() => router.push(href, { scroll: false }));
      }}
    />
  );
}
