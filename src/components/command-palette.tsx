"use client";

import {
  Banknote,
  Building2,
  FilePlus2,
  Files,
  Lightbulb,
  ListChecks,
  LogOut,
  NotebookPen,
  Receipt,
  User,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  searchEverythingAction,
  type SearchGroups,
} from "@/app/(app)/search/actions";
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

const ACTIONS = [
  { href: "/quick-add", label: "Quick add", icon: UserPlus },
  { href: "/activities/new", label: "Log activity", icon: NotebookPen },
  { href: "/materials/new", label: "New material", icon: FilePlus2 },
  { href: "/money/invoices/new", label: "New invoice", icon: Receipt },
  { href: "/money/payments/new", label: "Record payment", icon: Banknote },
  { href: "/brainstorm/new", label: "New brainstorm board", icon: Lightbulb },
];

const GROUPS: { key: keyof SearchGroups; heading: string; icon: LucideIcon }[] = [
  { key: "companies", heading: "Companies", icon: Building2 },
  { key: "people", heading: "People", icon: User },
  { key: "materials", heading: "Materials", icon: Files },
  { key: "invoices", heading: "Invoices", icon: Receipt },
  { key: "workflows", heading: "Workflows", icon: Workflow },
  { key: "brainstorms", heading: "Brainstorm boards", icon: Lightbulb },
  { key: "activities", heading: "Activities", icon: NotebookPen },
  { key: "tasks", heading: "Tasks", icon: ListChecks },
];

export function CommandPalette({
  open,
  onOpenChange,
  screens,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screens: { href: string; label: string; icon: LucideIcon }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{
    query: string;
    groups: SearchGroups | null;
  } | null>(null);
  // Ctrl+K also closes it from the shell, so it starts afresh whichever way it was closed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setQuery("");
      setFound(null);
    }
  }
  const typed = query.trim();
  const searching = typed.length >= 2 && found?.query !== typed;

  useEffect(() => {
    if (!open || typed.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const groups = await searchEverythingAction(typed).catch(() => null);
      if (!stale) setFound({ query: typed, groups });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, typed]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  // cmdk's own filter would hide the records the server found, so the fixed entries are filtered here.
  const shows = (label: string) =>
    label.toLowerCase().includes(typed.toLowerCase());
  const shownScreens = screens.filter((item) => shows(item.label));
  const shownActions = ACTIONS.filter((item) => shows(item.label));
  const showsSignOut = shows("Sign out");
  const groups = typed.length >= 2 && found?.query === typed ? found.groups : null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search your records, jump to a screen or run an action"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search or jump to…"
        />
        <CommandList>
          {!searching && <CommandEmpty>Nothing matches.</CommandEmpty>}
          {shownScreens.length > 0 && (
            <CommandGroup heading="Screens">
              {shownScreens.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`screen:${item.href}`}
                  onSelect={() => go(item.href)}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {shownActions.length > 0 && (
            <CommandGroup heading="Actions">
              {shownActions.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`action:${item.href}`}
                  onSelect={() => go(item.href)}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searching && (
            <div
              role="status"
              className="px-3 py-4 text-center text-sm text-muted-foreground"
            >
              Searching…
            </div>
          )}
          {groups &&
            GROUPS.map(({ key, heading, icon: Icon }) =>
              groups[key].length > 0 ? (
                <CommandGroup key={key} heading={heading}>
                  {groups[key].map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={`${key}:${hit.id}`}
                      onSelect={() => go(hit.href)}
                    >
                      <Icon aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                      {hit.hint && (
                        <span className="max-w-[50%] truncate text-muted-foreground">
                          {hit.hint}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          {showsSignOut && (
            <CommandGroup heading="Account">
              <CommandItem value="account:sign-out" onSelect={() => void signOutAction()}>
                <LogOut aria-hidden />
                Sign out
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
