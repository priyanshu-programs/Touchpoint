import { and, asc, eq } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { contactTags, organizationTags, tags } from "@/db/schema";

export async function listTags(ownerId: string) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .orderBy(asc(tags.name))
    .limit(200);
}

export async function contactTagNames(
  executor: Executor,
  ownerId: string,
  contactId: string,
) {
  const rows = await executor
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(
      and(eq(contactTags.ownerId, ownerId), eq(contactTags.contactId, contactId)),
    )
    .orderBy(asc(tags.name));
  return rows.map((row) => row.name);
}

export async function organizationTagNames(
  executor: Executor,
  ownerId: string,
  organizationId: string,
) {
  const rows = await executor
    .select({ name: tags.name })
    .from(organizationTags)
    .innerJoin(tags, eq(tags.id, organizationTags.tagId))
    .where(
      and(
        eq(organizationTags.ownerId, ownerId),
        eq(organizationTags.organizationId, organizationId),
      ),
    )
    .orderBy(asc(tags.name));
  return rows.map((row) => row.name);
}
