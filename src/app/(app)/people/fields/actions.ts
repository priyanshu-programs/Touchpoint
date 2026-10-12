"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { FIELD_ENTITY_TYPES, layoutInput } from "@/modules/fields/schema";
import { saveLayout } from "@/modules/fields/service";

export async function saveFieldLayoutAction(entityType: string, fields: unknown) {
  const owner = await requireOwner();
  const saved = await saveLayout(
    owner.id,
    z.enum(FIELD_ENTITY_TYPES).parse(entityType),
    layoutInput.parse(fields),
  );
  if (!saved) notFound();
  revalidatePath("/people", "layout");
}
