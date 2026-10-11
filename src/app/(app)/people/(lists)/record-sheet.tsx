"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// The panel a company or a person opens in. It is there for as long as the URL names
// a record; closing slides it away and then goes back to the bare list.
export function RecordSheet({
  closeHref,
  recordKey,
  children,
}: {
  closeHref: string;
  // Changes when the panel shows a different record, so the new one eases in.
  recordKey: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(nowOpen) => {
        if (!nowOpen) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
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
