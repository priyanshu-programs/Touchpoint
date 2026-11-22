import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiMemories,
  contacts,
  organizations,
  user,
  type AiMemoryScope,
  type AiMemorySource,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";

// Owner's choice, 2026-11-22.
export const MEMORY_LIMIT = 500;

export type MemoryFields = {
  scope: AiMemoryScope;
  contactId: string | null;
  organizationId: string | null;
  content: string;
  terms: string | null;
};

export type MemoryRefusal = { ok: false; message: string };

export const FULL = `You have ${MEMORY_LIMIT} memories, the most kept. Delete some in Settings → Memory first.`;
export const ALREADY = "That is remembered already.";

const sameRecord = (fields: Pick<MemoryFields, "scope" | "contactId" | "organizationId">) =>
  fields.scope === "person"
    ? eq(aiMemories.contactId, fields.contactId!)
    : fields.scope === "company"
      ? eq(aiMemories.organizationId, fields.organizationId!)
      : eq(aiMemories.scope, "you");

// The same words about the same record, whatever their case or spacing.
async function alreadyKept(ownerId: string, fields: MemoryFields, exceptId?: string) {
  const [row] = await db
    .select({ id: aiMemories.id })
    .from(aiMemories)
    .where(
      and(
        eq(aiMemories.ownerId, ownerId),
        sameRecord(fields),
        sql`lower(regexp_replace(${aiMemories.content}, '\\s+', ' ', 'g')) = lower(regexp_replace(${fields.content}, '\\s+', ' ', 'g'))`,
        exceptId ? sql`${aiMemories.id} <> ${exceptId}` : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

// Checked before a card is shown, so the model hears at once why it can't be kept.
export async function checkNewMemory(ownerId: string, fields: MemoryFields): Promise<MemoryRefusal | null> {
  if ((await db.$count(aiMemories, eq(aiMemories.ownerId, ownerId))) >= MEMORY_LIMIT) {
    return { ok: false, message: FULL };
  }
  if (await alreadyKept(ownerId, fields)) return { ok: false, message: ALREADY };
  return null;
}

// The person or company must be the owner's own; checked again here, whoever asks.
async function ownsRecord(ownerId: string, fields: MemoryFields) {
  if (fields.scope === "person") {
    return (await db.$count(contacts, and(eq(contacts.ownerId, ownerId), eq(contacts.id, fields.contactId!)))) === 1;
  }
  if (fields.scope === "company") {
    return (
      (await db.$count(
        organizations,
        and(eq(organizations.ownerId, ownerId), eq(organizations.id, fields.organizationId!)),
      )) === 1
    );
  }
  return true;
}

export const NO_RECORD = "That person or company isn't in Touchpoint.";

export async function addMemory(
  ownerId: string,
  fields: MemoryFields,
  source: AiMemorySource,
): Promise<{ ok: true; id: string } | MemoryRefusal> {
  if (!(await ownsRecord(ownerId, fields))) return { ok: false, message: NO_RECORD };
  return db.transaction(async (tx) => {
    // Locked while counting, so two saves at once can't both pass the limit.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for("update");
    if ((await tx.$count(aiMemories, eq(aiMemories.ownerId, ownerId))) >= MEMORY_LIMIT) {
      return { ok: false, message: FULL } as const;
    }
    if (await alreadyKept(ownerId, fields)) return { ok: false, message: ALREADY } as const;
    const [row] = await tx
      .insert(aiMemories)
      .values({ ownerId, ...fields, source })
      .returning({ id: aiMemories.id });
    await audit(tx, {
      ownerId,
      actor: source,
      action: "memory.create",
      entityType: "memory",
      entityId: row.id,
      after: fields,
    });
    return { ok: true, id: row.id } as const;
  });
}

export async function updateMemory(
  ownerId: string,
  id: string,
  change: { content: string; terms: string | null },
): Promise<{ ok: true } | MemoryRefusal> {
  const [current] = await db
    .select()
    .from(aiMemories)
    .where(and(eq(aiMemories.ownerId, ownerId), eq(aiMemories.id, id)));
  if (!current) return { ok: false, message: "That memory is gone." };
  if (await alreadyKept(ownerId, { ...current, ...change }, id)) {
    return { ok: false, message: ALREADY };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(aiMemories)
      .set(change)
      .where(and(eq(aiMemories.ownerId, ownerId), eq(aiMemories.id, id)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "memory.update",
      entityType: "memory",
      entityId: id,
      before: { content: current.content, terms: current.terms },
      after: change,
    });
  });
  return { ok: true };
}

export async function deleteMemory(ownerId: string, id: string, actor: "user" | "job" = "user") {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(aiMemories)
      .where(and(eq(aiMemories.ownerId, ownerId), eq(aiMemories.id, id)))
      .returning();
    if (!removed) return false;
    await audit(tx, {
      ownerId,
      actor,
      action: "memory.delete",
      entityType: "memory",
      entityId: id,
      before: { scope: removed.scope, content: removed.content, terms: removed.terms },
    });
    return true;
  });
}

export type ListedMemory = {
  id: string;
  scope: AiMemoryScope;
  content: string;
  terms: string | null;
  source: AiMemorySource;
  recordId: string | null;
  recordName: string | null;
  createdAt: Date;
};

const recordName = sql<string | null>`coalesce(${contacts.fullName}, ${organizations.name})`;

const listed = {
  id: aiMemories.id,
  scope: aiMemories.scope,
  content: aiMemories.content,
  terms: aiMemories.terms,
  source: aiMemories.source,
  recordId: sql<string | null>`coalesce(${aiMemories.contactId}, ${aiMemories.organizationId})`,
  recordName,
  createdAt: aiMemories.createdAt,
};

// Every memory (at most MEMORY_LIMIT), or those matching the words typed on the Memory page.
export async function listMemories(ownerId: string, query = ""): Promise<ListedMemory[]> {
  const q = query.trim();
  return db
    .select(listed)
    .from(aiMemories)
    .leftJoin(contacts, eq(contacts.id, aiMemories.contactId))
    .leftJoin(organizations, eq(organizations.id, aiMemories.organizationId))
    .where(
      and(
        eq(aiMemories.ownerId, ownerId),
        q
          ? sql`(${aiMemories.content} ilike ${`%${q}%`} or ${aiMemories.terms} ilike ${`%${q}%`} or ${recordName} ilike ${`%${q}%`})`
          : undefined,
      ),
    )
    .orderBy(asc(aiMemories.scope), asc(recordName), desc(aiMemories.createdAt))
    .limit(MEMORY_LIMIT);
}

export async function countMemories(ownerId: string) {
  return db.$count(aiMemories, eq(aiMemories.ownerId, ownerId));
}
