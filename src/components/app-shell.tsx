"use client";

import {
  Building2,
  Files,
  Lightbulb,
  ListChecks,
  LogOut,
  Plus,
  Receipt,
  Search,
  Settings,
  Sun,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { signOutAction } from "@/app/(app)/settings/actions";
import { ButtonLink } from "@/components/button-link";
import { CommandPalette } from "@/components/command-palette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Greeting } from "@/components/greeting";
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
      href: "/workflows",
      label: "Workflows",
      icon: Workflow,
      prefix: "/workflows",
    },
    {
      href: "/materials",
      label: "Materials",
      icon: Files,
      prefix: "/materials",
    },
    {
      href: "/money",
      label: "Money",
      icon: Receipt,
      prefix: "/money",
    },
    {
      href: "/brainstorm",
      label: "Brainstorming",
      icon: Lightbulb,
      prefix: "/brainstorm",
    },
    {
      href: "/settings/profile",
      label: "Settings",
      icon: Settings,
      prefix: "/settings",
    },
  ];
// The phone bar has room for four destinations; the rest are reached through "Go to".
const MOBILE_NAV = NAV.filter(
  (item) =>
    !["/workflows", "/materials", "/money", "/brainstorm"].includes(item.href),
);

const COLLAPSED_WIDTH = 56;
const DEFAULT_WIDTH = 224;
const MIN_WIDTH = 56;
const MAX_WIDTH = 320;
const COLLAPSE_THRESHOLD = 100;

function clampWidth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

function persistSidebar(width: number) {
  const clamped = clampWidth(width);
  const collapsed = clamped < COLLAPSE_THRESHOLD;
  document.cookie = `sidebar=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  document.cookie = `sidebar-width=${clamped}; path=/; max-age=31536000; samesite=lax`;
}

// At the foot of the sidebar; in the top bar on a phone, which has no sidebar.
function AccountMenu({
  ownerName,
  placement,
  className,
  children,
}: {
  ownerName: string;
  placement: "sidebar" | "top-bar";
  className: string;
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account" className={className}>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
        >
          {ownerName.trim().charAt(0).toUpperCase()}
        </span>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={placement === "sidebar" ? "top" : "bottom"}
        align={placement === "sidebar" ? "start" : "end"}
        className="min-w-44"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{ownerName}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void signOutAction()}>
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  ownerName,
  timezone,
  greeting,
  defaultCollapsed,
  defaultWidth,
  children,
}: {
  ownerName: string;
  timezone: string;
  greeting: string;
  defaultCollapsed: boolean;
  defaultWidth?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [width, setWidth] = useState(() =>
    defaultWidth !== undefined
      ? clampWidth(defaultWidth)
      : defaultCollapsed
        ? COLLAPSED_WIDTH
        : DEFAULT_WIDTH,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const lastExpandedRef = useRef(
    defaultWidth !== undefined && defaultWidth >= COLLAPSE_THRESHOLD
      ? clampWidth(defaultWidth)
      : DEFAULT_WIDTH,
  );

  const collapsed = width < COLLAPSE_THRESHOLD;

  const toggleSidebar = useCallback(() => {
    setWidth((prev) => {
      if (prev < COLLAPSE_THRESHOLD) return lastExpandedRef.current;
      lastExpandedRef.current = clampWidth(prev);
      return COLLAPSED_WIDTH;
    });
  }, []);

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
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // A cookie, not browser storage, so the server renders the chosen width on the next load.
  // Skip writes while dragging so we only persist the snapped result.
  useEffect(() => {
    if (isDragging) return;
    persistSidebar(width);
  }, [width, isDragging]);

  const isActive = (item: (typeof NAV)[number]) =>
    item.prefix ? pathname.startsWith(item.prefix) : pathname === item.href;

  function endDrag(commit: boolean) {
    const start = dragRef.current;
    dragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setIsDragging(false);
    if (commit && start) {
      setWidth((current) => {
        if (current < COLLAPSE_THRESHOLD) return COLLAPSED_WIDTH;
        const snapped = clampWidth(current);
        lastExpandedRef.current = snapped;
        return snapped;
      });
    }
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setIsDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;
    setWidth(clampWidth(start.startWidth + (event.clientX - start.startX)));
  }

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
          <Greeting name={ownerName} timezone={timezone} initial={greeting} />
        </p>
        <ButtonLink
          href="/quick-add"
          size="icon"
          aria-label="Quick add"
          title="Quick add"
        >
          <Plus aria-hidden />
        </ButtonLink>
        <AccountMenu
          ownerName={ownerName}
          placement="top-bar"
          className="rounded-full hover:opacity-80 md:hidden"
        />
      </header>

      <div className="flex flex-1">
        <aside
          style={{ width }}
          className={cn(
            "group sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-1 overflow-hidden border-r bg-sidebar text-sidebar-foreground md:flex",
            collapsed ? "px-2 py-3" : "p-3",
            !isDragging &&
              "transition-[width] duration-150 ease-out motion-reduce:transition-none",
          )}
        >
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title={collapsed ? "Go to… (Ctrl K)" : undefined}
            className={cn(railItem, "mb-2 border text-muted-foreground")}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className={railLabel}>Go to…</span>
            {!collapsed && (
              <kbd className="ml-auto font-mono text-xs">Ctrl K</kbd>
            )}
          </button>
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
          <AccountMenu
            ownerName={ownerName}
            placement="sidebar"
            className={cn(
              "mt-auto flex items-center gap-2 rounded-md py-1 text-left text-sm hover:bg-sidebar-accent",
              collapsed ? "justify-center px-0" : "px-1",
            )}
          >
            <span className={cn("min-w-0 truncate font-medium", railLabel)}>
              {ownerName}
            </span>
          </AccountMenu>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={Math.round(width)}
            title="Drag to resize (Ctrl B to collapse or expand)"
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(true)}
            onDoubleClick={toggleSidebar}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setWidth((prev) =>
                  clampWidth(prev - (event.shiftKey ? 24 : 8)),
                );
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                const next = clampWidth(
                  (collapsed ? COLLAPSED_WIDTH : width) +
                    (event.shiftKey ? 24 : 8),
                );
                if (next >= COLLAPSE_THRESHOLD)
                  lastExpandedRef.current = next;
                setWidth(next);
              } else if (event.key === "Home") {
                event.preventDefault();
                setWidth(COLLAPSED_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setWidth(lastExpandedRef.current);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleSidebar();
              }
            }}
            className="absolute top-0 right-0 z-10 flex h-full w-4 touch-none cursor-ew-resize items-center justify-center outline-none"
          >
            <span
              aria-hidden
              className={cn(
                "h-10 w-1 rounded-full transition-colors",
                isDragging
                  ? "bg-primary"
                  : "bg-border group-hover:bg-muted-foreground/50 focus-visible:bg-primary",
              )}
            />
          </div>
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        screens={NAV}
      />
    </div>
  );
}
