import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { contactTags, organizationTags, tags } from "@/db/schema";

async function ensureTags(tx: Tx, ownerId: string, names: string[]) {
  if (names.length === 0) return [];
  await tx
    .insert(tags)
    .values(names.map((name) => ({ ownerId, name })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), inArray(tags.name, names)));
  return rows.map((row) => row.id);
}

export async function setContactTags(
  tx: Tx,
  ownerId: string,
  contactId: string,
  names: string[],
) {
  const tagIds = await ensureTags(tx, ownerId, names);
  await tx
    .delete(contactTags)
    .where(
      and(eq(contactTags.ownerId, ownerId), eq(contactTags.contactId, contactId)),
    );
  if (tagIds.length > 0) {
    await tx
      .insert(contactTags)
      .values(tagIds.map((tagId) => ({ contactId, tagId, ownerId })));
  }
}

export async function setOrganizationTags(
  tx: Tx,
  ownerId: string,
  organizationId: string,
  names: string[],
) {
  const tagIds = await ensureTags(tx, ownerId, names);
  await tx
    .delete(organizationTags)
    .where(
      and(
        eq(organizationTags.ownerId, ownerId),
        eq(organizationTags.organizationId, organizationId),
      ),
    );
  if (tagIds.length > 0) {
    await tx
      .insert(organizationTags)
      .values(tagIds.map((tagId) => ({ organizationId, tagId, ownerId })));
  }
}
