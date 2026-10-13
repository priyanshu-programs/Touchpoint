"use client";

import { ChevronDown, Settings2 } from "lucide-react";
import { useTransition } from "react";
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
import { cn } from "@/lib/utils";
import type { StatusColor } from "@/modules/statuses/schema";
import { statusBadgeClass, StatusDot } from "./status-badge";

// The badge that says what a company or person is to the owner, changed where it is read.
// `manage` adds a last item for the list itself, where the owner can change it.
export function StatusMenu({
  label,
  value,
  options,
  action,
  manage,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; color?: StatusColor }[];
  action: (value: string) => Promise<void>;
  manage?: { label: string; onSelect: () => void };
}) {
  const [pending, startTransition] = useTransition();
  const chosen = options.find((option) => option.value === value);
  const current = chosen?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current}`}
        disabled={pending}
        className={cn(
          statusBadgeClass(chosen?.color),
          "cursor-pointer disabled:opacity-60",
          chosen?.color ? "hover:opacity-80" : "hover:bg-secondary/80",
        )}
      >
        {chosen?.color && <StatusDot color={chosen.color} />}
        {current}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next: string) =>
              startTransition(() => action(next))
            }
          >
            {options.map((option) => (
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
        {manage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={manage.onSelect}>
              <Settings2 aria-hidden />
              {manage.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
