"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Open for as long as the URL names a company; closing goes back to the bare list.
export function CompanySheet({
  closeHref,
  children,
}: {
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
        {children}
      </SheetContent>
    </Sheet>
  );
}
