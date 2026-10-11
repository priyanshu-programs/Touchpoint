"use client";

import {
  Building2,
  ListChecks,
  LogOut,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Only screens that exist are listed; each module adds its entry when it ships.
const NAV: { href: string; label: string; icon: LucideIcon; prefix?: string }[] =
  [
    { href: "/", label: "Today", icon: Sun },
    {
      href: "/people/organizations",
      label: "Companies",
      icon: Building2,
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
  defaultCollapsed,
  children,
}: {
  ownerName: string;
  defaultCollapsed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (key === "b") {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A cookie, not browser storage, so the server renders the chosen width on the next load.
  useEffect(() => {
    document.cookie = `sidebar=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);

  const isActive = (item: (typeof NAV)[number]) =>
    item.prefix ? pathname.startsWith(item.prefix) : pathname === item.href;

  const railItem = cn(
    "flex items-center gap-2 rounded-md py-2 text-sm hover:bg-sidebar-accent",
    collapsed ? "justify-center px-0" : "px-2",
  );
  const railLabel = cn(collapsed && "sr-only");

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:p-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
        >
          T
        </span>
        <p className="min-w-0 flex-1 truncate font-semibold tracking-tight">
          {ownerName} CRM
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account"
            className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium hover:bg-accent"
          >
            {ownerName.trim().charAt(0).toUpperCase()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">
                {ownerName}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void signOutAction()}>
                <LogOut aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground md:flex",
            collapsed ? "w-14 px-2" : "w-56",
          )}
        >
          <nav aria-label="Main" className="grid gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item) ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  railItem,
                  isActive(item) && "bg-sidebar-accent font-medium",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className={railLabel}>{item.label}</span>
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title={collapsed ? "Go to… (Ctrl K)" : undefined}
            className={cn(railItem, "mt-2 border text-muted-foreground")}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className={railLabel}>Go to…</span>
            {!collapsed && (
              <kbd className="ml-auto font-mono text-xs">Ctrl K</kbd>
            )}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar (Ctrl B)" : undefined}
            className={cn(railItem, "mt-auto text-muted-foreground")}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
            )}
            <span className={railLabel}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </button>
        </aside>

        <main
          id="main"
          className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 pb-24 md:p-8"
        >
          {children}
        </main>
      </div>

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
