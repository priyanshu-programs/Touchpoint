import type { CSSProperties } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { isHexColor } from "@/lib/color";
import { cn } from "@/lib/utils";

// A status's colour is whatever the owner picked, so it cannot be a class: it is
// handed to these fixed classes as --status. The tint is the colour at 15%, and the
// text is the colour mixed with the theme's own text colour, which keeps any pick
// (pale yellow, white, black) readable on the light and the dark background.
const TINTED =
  "bg-[color-mix(in_oklab,var(--status)_15%,transparent)] text-[color:color-mix(in_oklab,var(--status)_45%,var(--foreground))]";

// The class and style of a status's pill. Anything that is not a hex colour is
// left out of the style, and the pill is the plain badge.
export function statusBadge(color?: string) {
  const known = color !== undefined && isHexColor(color);
  return {
    className: cn(badgeVariants({ variant: "secondary" }), known && TINTED),
    style: known ? ({ "--status": color } as CSSProperties) : undefined,
  };
}

export function StatusDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full bg-muted-foreground", className)}
      style={isHexColor(color) ? { backgroundColor: color } : undefined}
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
  color?: string;
}) {
  return (
    <span {...statusBadge(color)}>
      {color && <StatusDot color={color} />}
      {label}
    </span>
  );
}
