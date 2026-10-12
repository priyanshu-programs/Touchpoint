import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldLayouts } from "@/db/schema";
import type { EntityType, LayoutInput } from "./schema";
import { STANDARD_FIELDS } from "./standard";

export type LayoutField = { key: string; label: string; hidden: boolean };

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

export async function getLayout(ownerId: string, entityType: EntityType) {
  const [row] = await db
    .select({ fields: fieldLayouts.fields })
    .from(fieldLayouts)
    .where(
      and(
        eq(fieldLayouts.ownerId, ownerId),
        eq(fieldLayouts.entityType, entityType),
      ),
    );
  return resolveLayout(STANDARD_FIELDS[entityType], row?.fields ?? []);
}
