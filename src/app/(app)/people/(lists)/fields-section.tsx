import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// A part of the Fields panel that folds away under its title; `note` says how
// many fields it holds and what can be done with them.
export function FieldsSection({
  title,
  note,
  open = false,
  children,
}: {
  title: string;
  note: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} aria-label={title} className="group border-b">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-right text-muted-foreground">{note}</span>
      </summary>
      <div className="border-t bg-muted/30 px-3 py-2">{children}</div>
    </details>
  );
}
