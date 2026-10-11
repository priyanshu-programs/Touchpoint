"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { enrichCompanyAction } from "../../organizations/actions";

const POLL_MS = 2_000;
const GIVE_UP_MS = 30_000;

export function WebsiteDetails({
  organizationId,
  summary,
  detail,
  reading,
  actionLabel,
}: {
  organizationId: string;
  summary: string;
  detail?: string;
  // A read is queued or under way, so the panel checks back until it lands.
  reading: boolean;
  actionLabel: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    enrichCompanyAction.bind(null, organizationId),
    null,
  );

  useEffect(() => {
    if (!reading) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reading, router]);

  return (
    <form
      action={formAction}
      className="mx-4 mb-4 grid justify-items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"
    >
      <p role="status" className="flex items-start gap-2">
        {reading && (
          <span
            aria-hidden
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
        <span className={reading ? "font-medium text-foreground" : undefined}>
          {state?.message ?? summary}
        </span>
      </p>
      {reading && detail && <p>{detail}</p>}
      {!reading && (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Starting…" : actionLabel}
        </Button>
      )}
    </form>
  );
}
