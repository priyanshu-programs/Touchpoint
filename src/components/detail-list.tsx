import type { ReactNode } from "react";

export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  const filled = items.filter((item) => item.value);
  if (filled.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No details recorded yet.</p>
    );
  }
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {filled.map((item) => (
        <div key={item.label} className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
