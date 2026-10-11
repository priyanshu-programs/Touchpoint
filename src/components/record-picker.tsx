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

// Chooses one record by searching on the server, so the list never has to be loaded whole.
export function RecordPicker({
  name,
  labelName,
  noun,
  initial,
  search,
}: {
  name: string;
  labelName: string;
  noun: string;
  initial: PickerOption | null;
  search: (query: string) => Promise<PickerOption[]>;
}) {
  const [selected, setSelected] = useState(initial);
  const [open, setOpen] = useState(false);
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

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={`Choose ${noun}`}
        description={`Search for the ${noun} by name`}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={`Search ${noun}s…`}
          />
          <CommandList>
            {results !== null && <CommandEmpty>Nothing matches.</CommandEmpty>}
            {results?.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                onSelect={() => {
                  setSelected(option);
                  setOpen(false);
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
    </div>
  );
}
