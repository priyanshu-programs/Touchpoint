import type { ReactNode } from "react";

export const counted = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

export const serviceName = (service: string | null) => service ?? "No service named";

// What a report says in place of a figure when nothing counts towards it, so an empty
// period never reads as zero.
export function NotEnoughData({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Not enough data.</span> {children}
    </p>
  );
}
