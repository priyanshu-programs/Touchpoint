"use client";

import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Columns3,
  ListFilter as FilterIcon,
  Search,
} from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { StatusDot } from "./status-badge";

// One thing a list can be narrowed by. The first choice is the one that narrows nothing.
export type ToolbarFilter = {
  label: string;
  value: string;
  options: {
    value: string;
    label: string;
    href: string;
    color?: string;
  }[];
};

// A column the list can be put in order by; `current` is the direction it is in now.
export type ToolbarSort = {
  label: string;
  href: string;
  current: "asc" | "desc" | null;
};

// The columns a list can go without, and which of them are turned off now.
export type ToolbarColumns = {
  cookie: string;
  options: readonly { key: string; label: string }[];
  hidden: readonly string[];
};

function keepHidden(cookie: string, keys: string[]) {
  document.cookie = `${cookie}=${keys.join(".")}; path=/; max-age=31536000; samesite=lax`;
}

// Which columns show is not part of the address: it is how the owner likes the list,
// whatever it is narrowed to, so it is kept in a cookie the page reads.
function ColumnsMenu({ cookie, options, hidden }: ToolbarColumns) {
  const router = useRouter();
  const [off, setOff] = useState(hidden);

  function show(key: string, shown: boolean) {
    const next = options
      .map((option) => option.key)
      .filter((each) => (each === key ? !shown : off.includes(each)));
    setOff(next);
    keepHidden(cookie, next);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Columns3 aria-hidden />
        Columns
        <span className="text-muted-foreground">
          ({options.length - off.length + 1})
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.key}
              checked={!off.includes(option.key)}
              onCheckedChange={(shown) => show(option.key, shown)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The row above a list: search at the left, and what narrows and orders it at the right.
// Every choice is an address worked out by the page, so the list is always what its URL says.
export function ListToolbar({
  path,
  search,
  keep,
  filters,
  sorts,
  columns,
  archived,
}: {
  path: string;
  search: { label: string; placeholder: string; value?: string };
  // What a search leaves as it is: the filters and the order.
  keep: Record<string, string | undefined>;
  filters: ToolbarFilter[];
  sorts?: ToolbarSort[];
  columns?: ToolbarColumns;
  archived?: { on: boolean; href: string };
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

        {columns && <ColumnsMenu {...columns} />}

        {archived && (
          <Button
            variant="outline"
            aria-pressed={archived.on}
            className="aria-pressed:border-foreground/40 aria-pressed:bg-muted"
            onClick={() => router.push(archived.href)}
          >
            <Archive aria-hidden />
            Archived
          </Button>
        )}
      </div>
    </div>
  );
}
