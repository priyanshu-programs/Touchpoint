"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/(app)/settings/actions";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { recordByName } from "@/modules/memory/recall";
import {
  memoryAddInput,
  memoryEditInput,
  memoryIdInput,
  memoryRecordAddInput,
} from "@/modules/memory/schema";
import { addMemory, deleteMemory, updateMemory } from "@/modules/memory/service";

// Memories show on the Memory page and in the Memory tab of people's and companies' panels.
function refresh() {
  revalidatePath("/settings/memory");
  revalidatePath("/people/contacts");
  revalidatePath("/people/organizations");
}

export async function addMemoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = memoryAddInput.safeParse(readFields(formData, ["about", "name", "content", "terms"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { about, name, content, terms } = parsed.data;

  let contactId: string | null = null;
  let organizationId: string | null = null;
  if (about !== "you") {
    const record = await recordByName(owner.id, about, name);
    if (!record.ok) return record;
    if (about === "person") contactId = record.id;
    else organizationId = record.id;
  }
  const result = await addMemory(
    owner.id,
    { scope: about, contactId, organizationId, content, terms: terms || null },
    "user",
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Remembered." };
}

export async function addRecordMemoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = memoryRecordAddInput.safeParse(
    readFields(formData, ["about", "recordId", "content", "terms"]),
  );
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { about, recordId, content, terms } = parsed.data;
  // addMemory checks the record is the owner's.
  const result = await addMemory(
    owner.id,
    {
      scope: about,
      contactId: about === "person" ? recordId : null,
      organizationId: about === "company" ? recordId : null,
      content,
      terms: terms || null,
    },
    "user",
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Remembered." };
}

export async function editMemoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = memoryEditInput.safeParse(readFields(formData, ["id", "content", "terms"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, content, terms } = parsed.data;
  const result = await updateMemory(owner.id, id, { content, terms: terms || null });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteMemoryAction(formData: FormData) {
  const owner = await requireOwner();
  const parsed = memoryIdInput.safeParse(readFields(formData, ["id"]));
  if (!parsed.success) return;
  await deleteMemory(owner.id, parsed.data.id);
  refresh();
}
