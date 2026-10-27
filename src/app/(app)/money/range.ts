import { formatDate } from "@/lib/time";

// How a list narrowed to dates says so, after "Issued" or "Received".
export function rangeText({ from, to }: { from?: string; to?: string }) {
  if (from && to) {
    return from === to ? `on ${formatDate(from)}` : `from ${formatDate(from)} to ${formatDate(to)}`;
  }
  if (from) return `on or after ${formatDate(from)}`;
  if (to) return `on or before ${formatDate(to)}`;
  return null;
}
