import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customFieldDefs, fieldLayouts } from "@/db/schema";
import { customKey, type EntityType, type LayoutInput } from "./schema";
import { STANDARD_FIELDS } from "./standard";

export type LayoutField = { key: string; label: string; hidden: boolean };
export type CustomField = Awaited<ReturnType<typeof listCustomFields>>[number];

// The stored order first; a field it has never seen goes to the end, shown,
// and a key that no longer names a field is dropped.
export function resolveLayout(
  known: readonly { key: string; label: string }[],
  stored: LayoutInput,
): LayoutField[] {
  const byKey = new Map(known.map((field) => [field.key, field]));
  const placed = new Set(stored.map(({ key }) => key));
  return [
    ...stored.flatMap(({ key, hidden }) => {
      const field = byKey.get(key);
      return field ? [{ ...field, hidden }] : [];
    }),
    ...known
      .filter(({ key }) => !placed.has(key))
      .map((field) => ({ ...field, hidden: false })),
  ];
}

// The fields the owner added to that kind of record, oldest first.
export async function listCustomFields(ownerId: string, entityType: EntityType) {
  return db
    .select({
      id: customFieldDefs.id,
      key: customFieldDefs.key,
      label: customFieldDefs.label,
      type: customFieldDefs.type,
      options: customFieldDefs.options,
    })
    .from(customFieldDefs)
    .where(
      and(
        eq(customFieldDefs.ownerId, ownerId),
        eq(customFieldDefs.entityType, entityType),
      ),
    )
    .orderBy(asc(customFieldDefs.createdAt), asc(customFieldDefs.key));
}

// Standard fields in their order, then the owner's own in theirs.
export async function getLayout(ownerId: string, entityType: EntityType) {
  const [[row], custom] = await Promise.all([
    db
      .select({ fields: fieldLayouts.fields })
      .from(fieldLayouts)
      .where(
        and(
          eq(fieldLayouts.ownerId, ownerId),
          eq(fieldLayouts.entityType, entityType),
        ),
      ),
    listCustomFields(ownerId, entityType),
  ]);
  const stored = row?.fields ?? [];
  return [
    ...resolveLayout(STANDARD_FIELDS[entityType], stored),
    ...resolveLayout(
      custom.map(({ key, label }) => ({ key: customKey(key), label })),
      stored,
    ),
  ];
}
