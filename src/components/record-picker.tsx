"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type PickerOption = { id: string; label: string; hint?: string | null };
export type Search = (query: string) => Promise<PickerOption[]>;

type SearchProps = {
  noun: string;
  plural?: string;
  search: Search;
  exclude?: string[];
  empty?: string;
  onSelect: (option: PickerOption) => void;
};

// Searches on the server, so the list never has to be loaded whole.
function useFound(active: boolean, search: Search, exclude: string[]) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerOption[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await search(query);
      if (!stale) setResults(found);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active, query, search]);

  return {
    query,
    setQuery,
    shown: results?.filter((option) => !exclude.includes(option.id)),
  };
}

function SearchBody({
  noun,
  plural = `${noun}s`,
  empty = "Nothing matches.",
  query,
  setQuery,
  shown,
  onSelect,
  autoFocus,
}: Pick<SearchProps, "noun" | "plural" | "empty" | "onSelect"> & {
  query: string;
  setQuery: (query: string) => void;
  shown: PickerOption[] | undefined;
  autoFocus?: boolean;
}) {
  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={`Search ${plural}…`}
        autoFocus={autoFocus}
      />
      <CommandList>
        {shown && <CommandEmpty>{empty}</CommandEmpty>}
        {shown?.map((option) => (
          <CommandItem
            key={option.id}
            value={option.id}
            onSelect={() => onSelect(option)}
          >
            {option.label}
            {option.hint && (
              <span className="text-muted-foreground">{option.hint}</span>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function RecordSearchDialog({
  open,
  onOpenChange,
  exclude = [],
  onSelect,
  ...rest
}: SearchProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { query, setQuery, shown } = useFound(open, rest.search, exclude);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Choose ${rest.noun}`}
      description={`Search for the ${rest.noun} by name`}
    >
      <SearchBody
        {...rest}
        query={query}
        setQuery={setQuery}
        shown={shown}
        onSelect={(option) => {
          onSelect(option);
          onOpenChange(false);
        }}
      />
    </CommandDialog>
  );
}

// A press anywhere outside the picker closes its search, so opening another picker's
// search closes this one in the same press.
function useCloseOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [ref, open, close]);
}

// The same search, opening in the form right under the button that asked for it.
function RecordSearchInline({
  onOpenChange,
  exclude = [],
  onSelect,
  ...rest
}: SearchProps & { onOpenChange: (open: boolean) => void }) {
  const { query, setQuery, shown } = useFound(true, rest.search, exclude);

  return (
    <div
      className="overflow-hidden rounded-lg border"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onOpenChange(false);
        }
      }}
    >
      <SearchBody
        {...rest}
        query={query}
        setQuery={setQuery}
        shown={shown}
        autoFocus
        onSelect={(option) => {
          onSelect(option);
          onOpenChange(false);
        }}
      />
    </div>
  );
}

export function RecordPicker({
  name,
  labelName,
  noun,
  plural,
  initial,
  search,
  onChange,
  inline,
}: {
  name: string;
  labelName: string;
  noun: string;
  plural?: string;
  initial: PickerOption | null;
  search: Search;
  onChange?: (option: PickerOption | null) => void;
  inline?: boolean;
}) {
  const [selected, setSelectedState] = useState(initial);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useCloseOutside(root, Boolean(inline) && open, () => setOpen(false));
  const setSelected = (option: PickerOption | null) => {
    setSelectedState(option);
    onChange?.(option);
  };

  return (
    <div ref={root} className="grid content-start gap-2">
      <p className="text-sm leading-none font-medium capitalize">{noun}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1 justify-start"
          aria-label={
            selected ? `${noun}: ${selected.label}. Change` : `Choose ${noun}`
          }
          aria-expanded={inline ? open : undefined}
          onClick={() => setOpen(inline ? !open : true)}
        >
          <span className="truncate">
            {selected ? selected.label : `Choose ${noun}`}
          </span>
        </Button>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Clear ${noun}`}
            onClick={() => setSelected(null)}
          >
            Clear
          </Button>
        )}
      </div>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input type="hidden" name={labelName} value={selected?.label ?? ""} />

      {inline ? (
        open && (
          <RecordSearchInline
            onOpenChange={setOpen}
            noun={noun}
            plural={plural}
            search={search}
            onSelect={setSelected}
          />
        )
      ) : (
        <RecordSearchDialog
          open={open}
          onOpenChange={setOpen}
          noun={noun}
          plural={plural}
          search={search}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}

// Chooses several records. They are submitted as one JSON field of ids and labels, so a
// rejected form can show the choices again. With `value` and `onChange` the form holds
// the choices, so it can take people off.
export function RecordsPicker({
  name,
  noun,
  initial,
  search,
  empty,
  value,
  onChange,
  inline,
}: {
  name: string;
  noun: string;
  initial: PickerOption[];
  search: Search;
  empty?: string;
  value?: PickerOption[];
  onChange?: (options: PickerOption[]) => void;
  inline?: boolean;
}) {
  const [own, setOwn] = useState(initial);
  const selected = value ?? own;
  const setSelected = onChange ?? setOwn;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useCloseOutside(root, Boolean(inline) && open, () => setOpen(false));

  return (
    <div ref={root} className="grid content-start gap-2">
      <p className="text-sm leading-none font-medium capitalize">{noun}s</p>
      {selected.length > 0 && (
        <ul className="grid gap-1">
          {selected.map((option) => (
            <li key={option.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {option.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${noun}: ${option.label}`}
                onClick={() =>
                  setSelected(selected.filter((other) => other.id !== option.id))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        className="justify-start"
        aria-expanded={inline ? open : undefined}
        onClick={() => setOpen(inline ? !open : true)}
      >
        Add {noun}
      </Button>
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          selected.map(({ id, label }) => ({ id, label })),
        )}
      />

      {inline ? (
        open && (
          <RecordSearchInline
            onOpenChange={setOpen}
            noun={noun}
            search={search}
            empty={empty}
            exclude={selected.map((option) => option.id)}
            onSelect={(option) => setSelected([...selected, option])}
          />
        )
      ) : (
        <RecordSearchDialog
          open={open}
          onOpenChange={setOpen}
          noun={noun}
          search={search}
          empty={empty}
          exclude={selected.map((option) => option.id)}
          onSelect={(option) => setSelected([...selected, option])}
        />
      )}
    </div>
  );
}
