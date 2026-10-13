import { asc, eq } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { companyStatuses } from "@/db/schema";
import { BUILT_IN_STATUSES, isBuiltInStatus } from "./schema";

export type CompanyStatus = {
  key: string;
  label: string;
  color: string;
  builtIn: boolean;
};

// The built-in statuses in their own order, each in the colour the owner gave it
// if they gave one, then the owner's own, oldest first.
export async function listCompanyStatuses(
  ownerId: string,
  executor: Executor = db,
): Promise<CompanyStatus[]> {
  const rows = await executor
    .select({
      key: companyStatuses.key,
      label: companyStatuses.label,
      color: companyStatuses.color,
    })
    .from(companyStatuses)
    .where(eq(companyStatuses.ownerId, ownerId))
    .orderBy(asc(companyStatuses.createdAt), asc(companyStatuses.key));

  return [
    ...BUILT_IN_STATUSES.map((status) => ({
      ...status,
      color: rows.find((row) => row.key === status.key)?.color ?? status.color,
      builtIn: true,
    })),
    ...rows
      .filter((row) => !isBuiltInStatus(row.key))
      .map((row) => ({ ...row, builtIn: false })),
  ];
}
