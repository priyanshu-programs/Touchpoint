"use client";

import {
  ListChecks,
  LogOut,
  NotebookPen,
  Search,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/app/(app)/settings/actions";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Only screens that exist are listed; each module adds its entry when it ships.
const NAV: { href: string; label: string; icon: LucideIcon; prefix?: string }[] =
  [
    { href: "/", label: "Today", icon: Sun },
    {
      href: "/people/contacts",
      label: "People",
      icon: Users,
      prefix: "/people",
    },
    { href: "/tasks", label: "Tasks", icon: ListChecks, prefix: "/tasks" },
    {
      href: "/settings/profile",
      label: "Settings",
      icon: Settings,
      prefix: "/settings",
    },
  ];
// The phone bar has room for four destinations; the rest are reached through "Go to".
const MOBILE_NAV = NAV.slice(0, 4);

export function AppShell({
  ownerName,
  children,
}: {
  ownerName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActive = (item: (typeof NAV)[number]) =>
    item.prefix ? pathname.startsWith(item.prefix) : pathname === item.href;

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:p-2"
      >
        Skip to content
      </a>

      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground md:flex">
        <p className="px-2 py-3 text-lg font-semibold tracking-tight">
          Touchpoint
        </p>
        <nav aria-label="Main" className="grid gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent",
                isActive(item) && "bg-sidebar-accent font-medium",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mt-2 flex items-center gap-2 rounded-md border px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
        >
          <Search className="size-4" aria-hidden />
          Go to…
          <kbd className="ml-auto font-mono text-xs">Ctrl K</kbd>
        </button>
        <div className="mt-auto grid gap-1 border-t pt-3">
          <p className="truncate px-2 text-sm text-muted-foreground">
            {ownerName}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 md:p-8"
      >
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 flex border-t bg-background md:hidden"
      >
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground",
              isActive(item) && "font-medium text-foreground",
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground"
        >
          <Search className="size-5" aria-hidden />
          Go to
        </button>
      </nav>

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="Go to"
        description="Jump to a screen or run an action"
      >
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Screens">
              {NAV.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => {
                    setPaletteOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  setPaletteOpen(false);
                  router.push("/activities/new");
                }}
              >
                <NotebookPen aria-hidden />
                Log activity
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Account">
              <CommandItem onSelect={() => void signOutAction()}>
                <LogOut aria-hidden />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
