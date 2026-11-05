"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Override = (() => void) | null;

const PanelBack = createContext<((override: Override) => void) | null>(null);
const OverrideContext = createContext<Override>(null);

// Lets what a panel shows take over its back arrow for a step of its own, such as a
// form's confirmation, so going back returns to that form and not to the record.
export function PanelBackProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Override>(null);
  return (
    <PanelBack.Provider value={setOverride}>
      <OverrideContext.Provider value={override}>{children}</OverrideContext.Provider>
    </PanelBack.Provider>
  );
}

export function PanelBackLink({ href, label }: { href: string; label: string }) {
  const override = useContext(OverrideContext);
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      onClick={(event) => {
        if (!override) return;
        event.preventDefault();
        override();
      }}
      className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
    </Link>
  );
}

// Outside a panel there is no arrow, and this does nothing.
export function usePanelBack(override: Override) {
  const set = useContext(PanelBack);
  useEffect(() => {
    if (!set) return;
    set(() => override);
    return () => set(null);
  }, [set, override]);
}
