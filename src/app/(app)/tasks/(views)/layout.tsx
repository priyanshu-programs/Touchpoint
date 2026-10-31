import type { ReactNode } from "react";
import { ButtonLink } from "@/components/button-link";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/tasks", label: "Today" },
  { href: "/tasks/week", label: "Week" },
  { href: "/tasks/all", label: "All" },
  { href: "/tasks/calendar", label: "Calendar" },
];

export default function TaskViewsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <ButtonLink href="/tasks/new">Add task</ButtonLink>
      </div>
      <TabNav label="Task views" tabs={TABS} />
      {children}
    </div>
  );
}
