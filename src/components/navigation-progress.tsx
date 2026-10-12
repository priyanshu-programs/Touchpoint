"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { navigationEnded, useBusy } from "@/lib/progress";

const GIVE_UP_AFTER_MS = 15_000;

// The bar across the top of the window while a page or a server action is on its way.
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const busy = useBusy();

  // The new address is on screen, so the navigation that was under way has landed.
  useEffect(() => {
    navigationEnded();
  }, [pathname, search]);

  // A navigation that ends where it began never changes the address.
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(navigationEnded, GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!busy) return null;
  return <div role="progressbar" aria-label="Loading" className="progress-bar" />;
}
