"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// The panel a company or a person opens in. It is there for as long as the URL names
// a record; closing slides it away and then goes back to the bare list.
export function RecordSheet({
  closeHref,
  recordKey,
  narrow = false,
  children,
}: {
  closeHref: string;
  // The Fields panel is a list of names and needs less room than a record.
  narrow?: boolean;
  // Changes when the panel shows a different record, so the new one eases in.
  recordKey: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        // Escape in a value edited in place closes that editor, not the panel.
        const target = details.event.target;
        if (
          details.reason === "escape-key" &&
          target instanceof Element &&
          target.closest("[data-inline-editor]")
        ) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
      onOpenChangeComplete={(nowOpen) => {
        if (!nowOpen) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent
        className={cn(
          "gap-0 overflow-y-auto data-[side=right]:w-full",
          narrow
            ? "data-[side=right]:sm:max-w-xl"
            : "data-[side=right]:sm:max-w-4xl",
        )}
      >
        <div
          key={recordKey}
          className="transition duration-300 ease-out motion-reduce:transition-none starting:translate-x-6 starting:opacity-0"
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
