import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getOrganization } from "@/modules/organizations/queries";

// Shared by the workspace layout and its tabs, so one request reads the organization once.
export const loadOrganization = cache(async (id: string) => {
  const owner = await requireOwner();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();
  const organization = await getOrganization(owner.id, parsed.data);
  if (!organization) notFound();
  return { owner, organization };
});
