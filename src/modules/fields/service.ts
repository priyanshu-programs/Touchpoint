import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contacts,
  customFieldDefs,
  fieldLayouts,
  organizations,
} from "@/db/schema";
import { keyFor } from "@/lib/key";
import { audit } from "@/modules/audit/service";
import {
  customKey,
  isCustomKey,
  MAX_CUSTOM_FIELDS,
  MAX_OPTIONS,
  type CustomFieldChange,
  type CustomFieldInput,
  type EntityType,
  type LayoutInput,
} from "./schema";
import { STANDARD_FIELDS } from "./standard";
import { SUGGESTED_FIELDS } from "./suggested";

export type CustomFieldResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "limit" | "label_taken" | "too_many_options" | "not_found";
    };

const snapshot = (row: typeof customFieldDefs.$inferSelect) => ({
  entityType: row.entityType,
  key: row.key,
  label: row.label,
  type: row.type,
  options: row.options,
});

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const fieldsOf = (tx: Tx, ownerId: string, entityType: EntityType) =>
  tx
    .select()
    .from(customFieldDefs)
    .where(
      and(
        eq(customFieldDefs.ownerId, ownerId),
        eq(customFieldDefs.entityType, entityType),
      ),
    );

// Details tells its rows apart by their label, so no two fields of a record share one.
const labelTaken = (
  entityType: EntityType,
  existing: { id: string; label: string }[],
  label: string,
  exceptId?: string,
) =>
  STANDARD_FIELDS[entityType].some((field) => sameText(field.label, label)) ||
  existing.some((field) => field.id !== exceptId && sameText(field.label, label));

async function insertField(
  tx: Tx,
  ownerId: string,
  entityType: EntityType,
  field: CustomFieldInput,
): Promise<CustomFieldResult> {
  const existing = await fieldsOf(tx, ownerId, entityType);
  if (existing.length >= MAX_CUSTOM_FIELDS) return { ok: false, reason: "limit" };
  if (labelTaken(entityType, existing, field.label)) {
    return { ok: false, reason: "label_taken" };
  }

  const [row] = await tx
    .insert(customFieldDefs)
    .values({
      ownerId,
      entityType,
      key: keyFor(
        field.label,
        new Set(existing.map(({ key }) => key)),
        "field",
      ),
      label: field.label,
      type: field.type,
      options: field.options,
    })
    .returning();
  await audit(tx, {
    ownerId,
    actor: "user",
    action: "field.create",
    entityType: "custom_field",
    entityId: row.id,
    after: snapshot(row),
  });
  return { ok: true, id: row.id };
}

export async function createCustomField(
  ownerId: string,
  entityType: EntityType,
  input: CustomFieldInput,
) {
  return db.transaction((tx) => insertField(tx, ownerId, entityType, input));
}

// The field is the one this app suggests under that key, whatever else was sent.
export async function addSuggestedField(
  ownerId: string,
  entityType: EntityType,
  key: string,
): Promise<CustomFieldResult> {
  const suggestion = SUGGESTED_FIELDS[entityType].find(
    (field) => field.key === key,
  );
  if (!suggestion) return { ok: false, reason: "not_found" };
  return db.transaction((tx) =>
    insertField(tx, ownerId, entityType, {
      label: suggestion.label,
      type: suggestion.type,
      options: [...suggestion.options],
    }),
  );
}

export async function updateCustomField(
  ownerId: string,
  id: string,
  change: CustomFieldChange,
): Promise<CustomFieldResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(customFieldDefs)
      .where(and(eq(customFieldDefs.ownerId, ownerId), eq(customFieldDefs.id, id)))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };

    const existing = await fieldsOf(tx, ownerId, before.entityType);
    if (labelTaken(before.entityType, existing, change.label, id)) {
      return { ok: false, reason: "label_taken" };
    }
    const added =
      before.type === "select"
        ? change.options.filter(
            (option) => !before.options.some((held) => sameText(held, option)),
          )
        : [];
    const options = [...before.options, ...added];
    if (options.length > MAX_OPTIONS) {
      return { ok: false, reason: "too_many_options" };
    }

    const [row] = await tx
      .update(customFieldDefs)
      .set({ label: change.label, options })
      .where(and(eq(customFieldDefs.ownerId, ownerId), eq(customFieldDefs.id, id)))
      .returning();
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "field.update",
      entityType: "custom_field",
      entityId: id,
      before: snapshot(before),
      after: snapshot(row),
    });
    return { ok: true, id };
  });
}

export type OptionRemoval =
  | { ok: true; cleared: number }
  | { ok: false; reason: "not_found" | "unknown_option" | "last_option" };

// The option leaves the dropdown, and every record that held it is left without a value.
export async function removeCustomFieldOption(
  ownerId: string,
  id: string,
  option: string,
): Promise<OptionRemoval> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(customFieldDefs)
      .where(and(eq(customFieldDefs.ownerId, ownerId), eq(customFieldDefs.id, id)))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };
    if (before.type !== "select" || !before.options.includes(option)) {
      return { ok: false, reason: "unknown_option" };
    }
    if (before.options.length === 1) return { ok: false, reason: "last_option" };

    const [row] = await tx
      .update(customFieldDefs)
      .set({ options: before.options.filter((held) => held !== option) })
      .where(and(eq(customFieldDefs.ownerId, ownerId), eq(customFieldDefs.id, id)))
      .returning();
    const records = before.entityType === "organization" ? organizations : contacts;
    const cleared = await tx
      .update(records)
      .set({ custom: sql`${records.custom} - ${before.key}::text` })
      .where(
        and(
          eq(records.ownerId, ownerId),
          sql`${records.custom} ->> ${before.key}::text = ${option}`,
        ),
      )
      .returning({ id: records.id });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "field.option_remove",
      entityType: "custom_field",
      entityId: id,
      before: snapshot(before),
      after: { ...snapshot(row), removed: option, cleared: cleared.length },
    });
    return { ok: true, cleared: cleared.length };
  });
}

// The field goes with every value kept in it, and with its place in Details.
export async function deleteCustomField(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .delete(customFieldDefs)
      .where(and(eq(customFieldDefs.ownerId, ownerId), eq(customFieldDefs.id, id)))
      .returning();
    if (!before) return false;

    const records = before.entityType === "organization" ? organizations : contacts;
    await tx
      .update(records)
      .set({ custom: sql`${records.custom} - ${before.key}::text` })
      .where(
        and(
          eq(records.ownerId, ownerId),
          sql`${records.custom} ? ${before.key}::text`,
        ),
      );

    const layout = and(
      eq(fieldLayouts.ownerId, ownerId),
      eq(fieldLayouts.entityType, before.entityType),
    );
    const [stored] = await tx
      .select({ fields: fieldLayouts.fields })
      .from(fieldLayouts)
      .where(layout);
    if (stored?.fields.some(({ key }) => key === customKey(before.key))) {
      await tx
        .update(fieldLayouts)
        .set({
          fields: stored.fields.filter(
            ({ key }) => key !== customKey(before.key),
          ),
        })
        .where(layout);
    }

    await audit(tx, {
      ownerId,
      actor: "user",
      action: "field.delete",
      entityType: "custom_field",
      entityId: id,
      before: snapshot(before),
    });
    return true;
  });
}

// False when the layout names something that is not a field of that record.
// Standard fields and the owner's own are arranged apart: saving one kind
// leaves what is stored for the other as it was.
export async function saveLayout(
  ownerId: string,
  entityType: EntityType,
  fields: LayoutInput,
) {
  return db.transaction(async (tx) => {
    const custom = await fieldsOf(tx, ownerId, entityType);
    const known = new Set<string>([
      ...STANDARD_FIELDS[entityType].map(({ key }) => key),
      ...custom.map(({ key }) => customKey(key)),
    ]);
    if (fields.some(({ key }) => !known.has(key))) return false;

    const [before] = await tx
      .select({ fields: fieldLayouts.fields })
      .from(fieldLayouts)
      .where(
        and(
          eq(fieldLayouts.ownerId, ownerId),
          eq(fieldLayouts.entityType, entityType),
        ),
      );
    const arranged = new Set(fields.map(({ key }) => isCustomKey(key)));
    const after = [
      ...fields,
      ...(before?.fields ?? []).filter(
        ({ key }) => !arranged.has(isCustomKey(key)),
      ),
    ];
    await tx
      .insert(fieldLayouts)
      .values({ ownerId, entityType, fields: after })
      .onConflictDoUpdate({
        target: [fieldLayouts.ownerId, fieldLayouts.entityType],
        set: { fields: after, updatedAt: new Date() },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "fields.layout",
      entityType: "field_layout",
      entityId: entityType,
      before: before?.fields,
      after,
    });
    return true;
  });
}
