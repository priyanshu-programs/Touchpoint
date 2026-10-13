import { z } from "zod";
import { ORGANIZATION_STATUSES, STATUS_COLORS } from "@/db/schema";

export { STATUS_COLORS };
export type StatusColor = (typeof STATUS_COLORS)[number];

export const MAX_COMPANY_STATUSES = 20;

// The statuses every owner has. Their names are fixed; their colours are not.
export const BUILT_IN_STATUSES: readonly {
  key: (typeof ORGANIZATION_STATUSES)[number];
  label: string;
  color: StatusColor;
}[] = [
  { key: "prospect", label: "Prospect", color: "blue" },
  { key: "client", label: "Client", color: "green" },
  { key: "past_client", label: "Past client", color: "amber" },
  { key: "partner", label: "Partner", color: "purple" },
  { key: "other", label: "Other", color: "gray" },
];

// What a deleted status leaves its companies with.
export const FALLBACK_STATUS = "other";

export const isBuiltInStatus = (key: string) =>
  BUILT_IN_STATUSES.some((status) => status.key === key);

export const statusColor = z.enum(STATUS_COLORS, "Choose one of the colours");

export const statusInput = z.strictObject({
  label: z.string().trim().min(1, "Give the status a name").max(40),
  color: statusColor,
});

export type StatusInput = z.infer<typeof statusInput>;
