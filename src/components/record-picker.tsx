"use client";

import { useEffect, useState } from "react";
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

// Searches on the server, so the list never has to be loaded whole.
export function RecordSearchDialog({
  open,
  onOpenChange,
  noun,
  plural = `${noun}s`,
  search,
  exclude = [],
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noun: string;
  plural?: string;
  search: Search;
  exclude?: string[];
  onSelect: (option: PickerOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await search(query);
      if (!stale) setResults(found);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query, search]);

  const shown = results?.filter((option) => !exclude.includes(option.id));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Choose ${noun}`}
      description={`Search for the ${noun} by name`}
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={`Search ${plural}…`}
        />
        <CommandList>
          {shown && <CommandEmpty>Nothing matches.</CommandEmpty>}
          {shown?.map((option) => (
            <CommandItem
              key={option.id}
              value={option.id}
              onSelect={() => {
                onSelect(option);
                onOpenChange(false);
              }}
            >
              {option.label}
              {option.hint && (
                <span className="text-muted-foreground">{option.hint}</span>
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
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
}: {
  name: string;
  labelName: string;
  noun: string;
  plural?: string;
  initial: PickerOption | null;
  search: Search;
  onChange?: (option: PickerOption | null) => void;
}) {
  const [selected, setSelectedState] = useState(initial);
  const [open, setOpen] = useState(false);
  const setSelected = (option: PickerOption | null) => {
    setSelectedState(option);
    onChange?.(option);
  };

  return (
    <div className="grid content-start gap-2">
      <p className="text-sm leading-none font-medium capitalize">{noun}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1 justify-start"
          aria-label={
            selected ? `${noun}: ${selected.label}. Change` : `Choose ${noun}`
          }
          onClick={() => setOpen(true)}
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

      <RecordSearchDialog
        open={open}
        onOpenChange={setOpen}
        noun={noun}
        plural={plural}
        search={search}
        onSelect={setSelected}
      />
    </div>
  );
}

// Chooses several records. They are submitted as one JSON field of ids and labels, so a
// rejected form can show the choices again.
export function RecordsPicker({
  name,
  noun,
  initial,
  search,
}: {
  name: string;
  noun: string;
  initial: PickerOption[];
  search: Search;
}) {
  const [selected, setSelected] = useState(initial);
  const [open, setOpen] = useState(false);

  return (
    <div className="grid content-start gap-2">
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
        onClick={() => setOpen(true)}
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

      <RecordSearchDialog
        open={open}
        onOpenChange={setOpen}
        noun={noun}
        search={search}
        exclude={selected.map((option) => option.id)}
        onSelect={(option) => setSelected([...selected, option])}
      />
    </div>
  );
}
