import type { EngagementStatus } from "@/db/schema";
import {
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_STATUSES,
  type EngagementListParams,
} from "@/modules/engagements/schema";

// Fixed in code, unlike a company's statuses, which the owner colours.
export const ENGAGEMENT_STATUS_COLORS: Record<EngagementStatus, string> = {
  planned: "#64748b",
  active: "#16a34a",
  paused: "#d97706",
  completed: "#2563eb",
  cancelled: "#9ca3af",
};

export const engagementStatusOptions = ENGAGEMENT_STATUSES.map((value) => ({
  value,
  label: ENGAGEMENT_STATUS_LABELS[value],
  color: ENGAGEMENT_STATUS_COLORS[value],
}));

export const engagementHref = (id: string) => `/work/${id}`;

export function workHref(
  params: EngagementListParams,
  change: Partial<EngagementListParams> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...change })) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `/work${query ? `?${query}` : ""}`;
}
