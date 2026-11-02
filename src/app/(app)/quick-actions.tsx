import { Building2, FilePlus2, ListPlus, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTIONS = [
  { href: "/tasks/new", label: "Add task", icon: ListPlus },
  { href: "/activities/new", label: "Log activity", icon: MessageSquarePlus },
  { href: "/people/organizations/new", label: "New company", icon: Building2 },
  { href: "/money/invoices/new", label: "New invoice", icon: FilePlus2 },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2">
          {ACTIONS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="grid h-full justify-items-center gap-1.5 rounded-md bg-muted px-2 py-3 text-center text-xs font-medium transition hover:bg-primary hover:text-primary-foreground"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
