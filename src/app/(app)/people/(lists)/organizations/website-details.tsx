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
  reading,
  actionLabel,
}: {
  organizationId: string;
  summary: string;
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
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-sm text-muted-foreground"
    >
      <p role="status">{state?.message ?? summary}</p>
      {!reading && (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Starting…" : actionLabel}
        </Button>
      )}
    </form>
  );
}
