import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getContact } from "@/modules/contacts/queries";

// Shared by the workspace layout and its tabs, so one request reads the contact once.
export const loadContact = cache(async (id: string) => {
  const owner = await requireOwner();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();
  const contact = await getContact(owner.id, parsed.data);
  if (!contact) notFound();
  return { owner, contact };
});
