import { ButtonLink } from "@/components/button-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NextUp } from "./next-up";

const QUIET_BUTTON =
  "border-white/25 bg-transparent text-spotlight-foreground hover:bg-white/10 hover:text-spotlight-foreground";

// The title is plain text and the button only says "Open", because the same meeting or task
// is a link under its own name further down the page.
export function NextUpCard({ next }: { next: NextUp | null }) {
  return (
    <section
      aria-labelledby="next-up-heading"
      className="spotlight grid gap-4 rounded-xl p-5 ring-1 ring-primary/30"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-up-heading" className="text-sm font-medium text-spotlight-muted">
          Next up
        </h2>
        {next && (
          <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {next.label}
          </span>
        )}
      </div>

      {next ? (
        <>
          <div className="grid gap-1">
            <p id="next-up-title" className="text-xl font-semibold tracking-tight break-words">
              {next.title}
            </p>
            <p className="text-sm text-spotlight-muted">
              {next.when}
              {next.who && ` · ${next.who}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={next.href} aria-describedby="next-up-title">
              Open
            </ButtonLink>
            {next.joinUrl && (
              <a
                href={next.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), QUIET_BUTTON)}
              >
                Join meeting
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-1">
            <p className="text-xl font-semibold tracking-tight">You&apos;re clear.</p>
            <p className="text-sm text-spotlight-muted">
              No tasks or meetings in the next seven days.
            </p>
          </div>
          <ButtonLink href="/tasks/new" className="w-fit">
            Add task
          </ButtonLink>
        </>
      )}
    </section>
  );
}
