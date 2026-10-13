import type { ReactNode } from "react";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/people/organizations", label: "Companies" },
  { href: "/people/contacts", label: "People" },
];

// What stands above either list: its name, the button that adds to it, and the way to the other one.
export function ListHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      <TabNav label="Companies and people" tabs={TABS} />
    </>
  );
}
