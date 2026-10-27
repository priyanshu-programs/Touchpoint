"use client";

import { CalendarRange } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { RecordPicker, type PickerOption } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchClientsAction } from "./invoices/actions";

// The overview's period, a From and To of the owner's own, and the client it is for.
// Every choice is an address, so the page is what its URL says.
export function OverviewControls({
  periods,
  current,
  label,
  range,
  client,
}: {
  periods: { value: string; label: string; href: string }[];
  current: string;
  label: string;
  range: { from?: string; to?: string };
  client: { initial: PickerOption | null; keep: Record<string, string | undefined> };
}) {
  const router = useRouter();
  const clientHref = (option: PickerOption | null) => {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(client.keep)) {
      if (value !== undefined) search.set(name, value);
    }
    if (option) {
      const [kind, id] = option.id.split(":");
      search.set(kind === "organization" ? "company" : "person", id);
    }
    const query = search.toString();
    return `/money${query ? `?${query}` : ""}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr_minmax(0,18rem)] md:items-end">
      <div className="grid gap-2">
        <p className="text-sm leading-none font-medium">Period</p>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="justify-start" />}>
            <CalendarRange aria-hidden />
            {label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-44">
            <DropdownMenuRadioGroup
              value={current}
              onValueChange={(next: string) => {
                const chosen = periods.find((period) => period.value === next);
                if (chosen) router.push(chosen.href);
              }}
            >
              {periods.map((period) => (
                <DropdownMenuRadioItem key={period.value} value={period.value} closeOnClick>
                  {period.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Form action="/money" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-2">
          <Label htmlFor="overview-from">From</Label>
          <Input id="overview-from" name="from" type="date" defaultValue={range.from} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="overview-to">To</Label>
          <Input id="overview-to" name="to" type="date" defaultValue={range.to} required />
        </div>
        {client.initial && (
          <input
            type="hidden"
            name={client.initial.id.startsWith("organization:") ? "company" : "person"}
            value={client.initial.id.split(":")[1]}
          />
        )}
        <Button type="submit" variant="outline">
          Show
        </Button>
      </Form>

      <RecordPicker
        name="client"
        labelName="clientLabel"
        noun="client"
        plural="companies and people"
        initial={client.initial}
        search={searchClientsAction}
        onChange={(option) => router.push(clientHref(option))}
      />
    </div>
  );
}
