"use client";

import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ListFilter as FilterIcon,
  Search,
} from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { StatusColor } from "@/modules/statuses/schema";
import { StatusDot } from "./status-badge";

// One thing a list can be narrowed by. The first choice is the one that narrows nothing.
export type ToolbarFilter = {
  label: string;
  value: string;
  options: {
    value: string;
    label: string;
    href: string;
    color?: StatusColor;
  }[];
};

// A column the list can be put in order by; `current` is the direction it is in now.
export type ToolbarSort = {
  label: string;
  href: string;
  current: "asc" | "desc" | null;
};

// The row above a list: search at the left, and what narrows and orders it at the right.
// Every choice is an address worked out by the page, so the list is always what its URL says.
export function ListToolbar({
  path,
  search,
  keep,
  filters,
  sorts,
  archived,
}: {
  path: string;
  search: { label: string; placeholder: string; value?: string };
  // What a search leaves as it is: the filters and the order.
  keep: Record<string, string | undefined>;
  filters: ToolbarFilter[];
  sorts?: ToolbarSort[];
  archived: { on: boolean; href: string };
}) {
  const router = useRouter();
  const narrowed = filters.filter((filter) => filter.value !== "").length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Form action={path} className="w-full sm:w-80">
        <InputGroup className="h-9">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            name="q"
            type="search"
            aria-label={search.label}
            placeholder={search.placeholder}
            defaultValue={search.value}
          />
        </InputGroup>
        {Object.entries(keep).map(
          ([name, value]) =>
            value !== undefined && (
              <input key={name} type="hidden" name={name} value={value} />
            ),
        )}
      </Form>

      <div className="flex flex-wrap items-center gap-2">
        {filters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <FilterIcon aria-hidden />
              Filters
              {narrowed > 0 && (
                <span className="text-muted-foreground">({narrowed})</span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-44">
              {filters.map((filter, index) => (
                <DropdownMenuGroup key={filter.label}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filter.value}
                    onValueChange={(next: string) => {
                      const chosen = filter.options.find(
                        (option) => option.value === next,
                      );
                      if (chosen) router.push(chosen.href);
                    }}
                  >
                    {filter.options.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        closeOnClick
                      >
                        {option.color && <StatusDot color={option.color} />}
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {sorts && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <ArrowDownUp aria-hidden />
              Sort
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                {sorts.map((sort) => (
                  <DropdownMenuItem
                    key={sort.label}
                    onClick={() => router.push(sort.href)}
                  >
                    {sort.label}
                    {sort.current === "asc" && (
                      <ArrowUp aria-label="ascending" className="ml-auto" />
                    )}
                    {sort.current === "desc" && (
                      <ArrowDown aria-label="descending" className="ml-auto" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="outline"
          aria-pressed={archived.on}
          className="aria-pressed:border-foreground/40 aria-pressed:bg-muted"
          onClick={() => router.push(archived.href)}
        >
          <Archive aria-hidden />
          Archived
        </Button>
      </div>
    </div>
  );
}
