import { z } from "zod";
import type { ORGANIZATION_STATUSES } from "@/db/schema";
import { HEX_COLOR } from "@/lib/color";

export const MAX_COMPANY_STATUSES = 20;

// The statuses every owner has. Their names are fixed; their colours are not.
export const BUILT_IN_STATUSES: readonly {
  key: (typeof ORGANIZATION_STATUSES)[number];
  label: string;
  color: string;
}[] = [
  { key: "prospect", label: "Prospect", color: "#3b82f6" },
  { key: "client", label: "Client", color: "#22c55e" },
  { key: "past_client", label: "Past client", color: "#f59e0b" },
  { key: "partner", label: "Partner", color: "#a855f7" },
  { key: "other", label: "Other", color: "#a1a1aa" },
];

// What a deleted status leaves its companies with.
export const FALLBACK_STATUS = "other";

export const isBuiltInStatus = (key: string) =>
  BUILT_IN_STATUSES.some((status) => status.key === key);

// Any colour the owner picks; "#FF8800" is kept as "#ff8800".
export const statusColor = z
  .string()
  .trim()
  .toLowerCase()
  .regex(HEX_COLOR, "Pick a colour");

export const statusInput = z.strictObject({
  label: z.string().trim().min(1, "Give the status a name").max(40),
  color: statusColor,
});

export type StatusInput = z.infer<typeof statusInput>;
