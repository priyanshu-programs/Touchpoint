import type { ReactNode } from "react";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/people/organizations", label: "Companies" },
  { href: "/people/contacts", label: "People" },
];

export default function PeopleListsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
      <TabNav label="Companies and people" tabs={TABS} />
      {children}
    </div>
  );
}
