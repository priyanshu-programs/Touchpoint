"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="grid justify-items-start gap-3">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        The page could not be loaded. Nothing was changed.
        {error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
