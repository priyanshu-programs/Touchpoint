"use client";

import { ChevronDown } from "lucide-react";
import { useTransition } from "react";
import { badgeVariants } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// The badge that says what a company or person is to the owner, changed where it is read.
export function StatusMenu({
  label,
  value,
  options,
  action,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  action: (value: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const current = options.find((option) => option.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current}`}
        disabled={pending}
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "cursor-pointer hover:bg-secondary/80 disabled:opacity-60",
        )}
      >
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
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
