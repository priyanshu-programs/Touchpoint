import type { EngagementStatus } from "@/db/schema";
import { formatDate } from "@/lib/time";
import { ENGAGEMENT_STATUS_LABELS } from "@/modules/engagements/schema";
import { StatusBadge } from "../people/(lists)/status-badge";
import { ENGAGEMENT_STATUS_COLORS } from "./labels";

export function EngagementStatusBadge({ status }: { status: string }) {
  const known = status as EngagementStatus;
  return (
    <StatusBadge
      label={ENGAGEMENT_STATUS_LABELS[known] ?? status}
      color={ENGAGEMENT_STATUS_COLORS[known]}
    />
  );
}

export function DateText({ date }: { date: string | null }) {
  return date ? (
    <span className="whitespace-nowrap">{formatDate(date)}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}
