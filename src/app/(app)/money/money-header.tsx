import type { ReactNode } from "react";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/money/invoices", label: "Invoices" },
  { href: "/money/payments", label: "Payments" },
];

// What stands above the invoices and the payments: the list's name, the button that
// adds to it, and the way to the other one.
export function MoneyHeader({
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
      <TabNav label="Invoices and payments" tabs={TABS} />
    </>
  );
}
