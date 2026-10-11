import type { ReactNode } from "react";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/people/contacts", label: "Contacts" },
  { href: "/people/organizations", label: "Organizations" },
];

export default function PeopleListsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>
      <TabNav label="People" tabs={TABS} />
      {children}
    </div>
  );
}
