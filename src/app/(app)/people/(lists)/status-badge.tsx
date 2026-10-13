import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusColor } from "@/modules/statuses/schema";

// Written out in full, since a class put together at run time is never generated.
// The tints are translucent so one set reads on the light and the dark background.
const CLASSES: Record<StatusColor, { name: string; dot: string; badge: string }> = {
  gray: {
    name: "Gray",
    dot: "bg-zinc-400",
    badge: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  },
  red: {
    name: "Red",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  orange: {
    name: "Orange",
    dot: "bg-orange-500",
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  amber: {
    name: "Amber",
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  green: {
    name: "Green",
    dot: "bg-green-500",
    badge: "bg-green-500/15 text-green-700 dark:text-green-300",
  },
  teal: {
    name: "Teal",
    dot: "bg-teal-500",
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  blue: {
    name: "Blue",
    dot: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  purple: {
    name: "Purple",
    dot: "bg-purple-500",
    badge: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  pink: {
    name: "Pink",
    dot: "bg-pink-500",
    badge: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  },
};

export const STATUS_COLOR_OPTIONS = (
  Object.keys(CLASSES) as StatusColor[]
).map((value) => ({ value, label: CLASSES[value].name }));

export const statusColorName = (color: StatusColor) => CLASSES[color].name;

// The classes of a status's pill; without a colour, the plain badge.
export const statusBadgeClass = (color?: StatusColor) =>
  cn(
    badgeVariants({ variant: "secondary" }),
    color && CLASSES[color].badge,
  );

export function StatusDot({
  color,
  className,
}: {
  color: StatusColor;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", CLASSES[color].dot, className)}
    />
  );
}

// What a company is to the owner, in the colour they gave that status. A status
// that no longer exists has no colour.
export function StatusBadge({
  label,
  color,
}: {
  label: string;
  color?: StatusColor;
}) {
  return (
    <span className={statusBadgeClass(color)}>
      {color && <StatusDot color={color} />}
      {label}
    </span>
  );
}
