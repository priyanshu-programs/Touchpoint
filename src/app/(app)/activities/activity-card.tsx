import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ContactAvatar } from "@/components/company-logo";

const SHOWN_PEOPLE = 4;

const dayPart = (date: string, part: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...part, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

// One entry on a record's Activity tab: its day on the left, then when and where, then
// what and who, and an optional action at the end.
export function ActivityCard({
  day,
  details,
  title,
  below,
  action,
}: {
  // The entry's date (YYYY-MM-DD) in the owner's zone.
  day: string;
  details: ReactNode;
  title: ReactNode;
  below?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className="flex min-w-0 items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-xs sm:gap-5 sm:px-5">
      {/* The theme's lime is too light for text on white, so light mode uses its darker green. */}
      <div className="flex w-12 shrink-0 flex-col items-center justify-center self-stretch border-r pr-4 text-center text-chart-bar sm:w-14 sm:pr-5 dark:text-primary">
        <span className="text-sm font-medium">{dayPart(day, { weekday: "short" })}</span>
        <span className="text-3xl leading-none font-semibold tabular-nums">
          {dayPart(day, { day: "numeric" })}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          {dayPart(day, { month: "short" })}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
        <div className="grid min-w-0 shrink-0 gap-1.5 text-sm text-muted-foreground sm:w-44">
          {details}
        </div>
        <div className="order-first grid min-w-0 flex-1 gap-1.5 sm:order-none">
          {title}
          {below}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </article>
  );
}

export function DetailRow({
  icon: Icon,
  children,
  title,
}: {
  icon: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2" title={title}>
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground/80" />
      <span className="min-w-0 truncate tabular-nums">{children}</span>
    </p>
  );
}

// Up to four faces overlapping, with how many more. Without links the names are read out
// as one sentence; with them, each face is a link named for its person.
export function People({
  people,
  href,
}: {
  people: { id: string; name: string; photoVersion: string | null }[];
  href?: (id: string) => string;
}) {
  if (people.length === 0) return null;
  const extra = people.length - SHOWN_PEOPLE;
  return (
    <p className="flex shrink-0 items-center">
      {!href && (
        <span className="sr-only">With {people.map((person) => person.name).join(", ")}</span>
      )}
      <span aria-hidden={!href} className="flex -space-x-2">
        {people.slice(0, SHOWN_PEOPLE).map((person) => {
          const face = (
            <ContactAvatar
              id={person.id}
              name={person.name}
              photoVersion={person.photoVersion}
              className="ring-2 ring-card"
            />
          );
          return href ? (
            <Link
              key={person.id}
              href={href(person.id)}
              aria-label={person.name}
              title={person.name}
              className="rounded-full hover:z-10 focus-visible:z-10"
            >
              {face}
            </Link>
          ) : (
            <span key={person.id} title={person.name}>
              {face}
            </span>
          );
        })}
      </span>
      {extra > 0 && (
        <span aria-hidden className="ml-2 text-xs text-muted-foreground">
          +{extra}
        </span>
      )}
    </p>
  );
}
