import {
  Building2,
  FileText,
  Hourglass,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TILE =
  "grid h-full content-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10";
const SMALL_FIGURE = "text-xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]";
const LARGE_FIGURE = "text-4xl @5xl:text-5xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]";

function Chip({ icon: Icon, strong }: { icon: LucideIcon; strong?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-foreground",
        strong ? "bg-primary text-primary-foreground" : "bg-primary/25",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function Tile({
  href,
  label,
  figure,
  more,
  icon,
  large,
}: {
  href: string;
  label: string;
  figure: string | number;
  more?: string | null;
  icon: LucideIcon;
  large?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        TILE,
        "transition hover:bg-accent hover:shadow-md motion-safe:hover:-translate-y-0.5",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Chip icon={icon} strong={large} />
        <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      </span>
      <span className="grid gap-1">
        <span className={large ? LARGE_FIGURE : SMALL_FIGURE}>{figure}</span>
        {more && <span className="text-sm text-muted-foreground">{more}</span>}
      </span>
    </Link>
  );
}

const MONEY_ICONS = [Wallet, FileText, Hourglass];

export type MoneyTile = { label: string; href: string; figure: string; more: string | null };

// One grid of one large tile and four small; the two lists stay lists for a screen reader
// with their tiles laid out in the grid, so `role` is said outright.
export function TodayTiles({
  money,
  people,
}: {
  money: MoneyTile[] | null;
  people: { href: string; label: string; count: number }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4 @xl:grid-cols-[1.25fr_1fr_1fr]">
      {money ? (
        <ul role="list" aria-label="Money" className="contents">
          {money.map((tile, index) => (
            <li
              key={tile.label}
              className={cn(index === 0 && "col-span-2 @xl:col-span-1 @xl:row-span-2")}
            >
              <Tile {...tile} icon={MONEY_ICONS[index]} large={index === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={cn(TILE, "col-span-2 @xl:col-span-1")}>
          <span className="flex items-center gap-2">
            <Chip icon={Wallet} strong />
            <span className="text-sm text-muted-foreground">Money</span>
          </span>
          <p className="grid gap-1 text-sm">
            <span className="font-medium">No money recorded yet.</span>
            <Link
              href="/money/invoices/new"
              className="w-fit text-muted-foreground underline underline-offset-4"
            >
              Add your first invoice
            </Link>
          </p>
        </div>
      )}
      <ul role="list" aria-label="People" className="contents">
        {people.map((tile) => (
          <li key={tile.href}>
            <Tile
              href={tile.href}
              label={tile.label}
              figure={tile.count}
              icon={tile.href.endsWith("contacts") ? Users : Building2}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
