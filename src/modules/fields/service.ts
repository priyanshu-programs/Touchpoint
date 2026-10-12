import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldLayouts } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import type { EntityType, LayoutInput } from "./schema";
import { STANDARD_FIELDS } from "./standard";

// False when the layout names something that is not a field of that record.
export async function saveLayout(
  ownerId: string,
  entityType: EntityType,
  fields: LayoutInput,
) {
  const known = new Set<string>(
    STANDARD_FIELDS[entityType].map(({ key }) => key),
  );
  if (fields.some(({ key }) => !known.has(key))) return false;

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ fields: fieldLayouts.fields })
      .from(fieldLayouts)
      .where(
        and(
          eq(fieldLayouts.ownerId, ownerId),
          eq(fieldLayouts.entityType, entityType),
        ),
      );
    await tx
      .insert(fieldLayouts)
      .values({ ownerId, entityType, fields })
      .onConflictDoUpdate({
        target: [fieldLayouts.ownerId, fieldLayouts.entityType],
        set: { fields, updatedAt: new Date() },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "fields.layout",
      entityType: "field_layout",
      entityId: entityType,
      before: before?.fields,
      after: fields,
    });
    return true;
  });
}
