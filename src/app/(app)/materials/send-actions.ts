"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { timelineOf } from "@/app/(app)/activities/timeline-href";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields, readOrigin } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { sendInput, sendStatus } from "@/modules/materials/schema";
import { logSend, removeSend, setSendStatus } from "@/modules/materials/service";
import { SEND_REFUSALS } from "./labels";

const FIELDS = ["versionId", "sentAt", "channel", "organizationId", "note"] as const;

const pickedContacts = z
  .array(z.strictObject({ id: z.uuid(), label: z.string().max(300) }))
  .max(20);

// A send shows on every linked record's timeline and in its version's count.
const refresh = () => revalidatePath("/", "layout");

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function logSendAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const origin = readOrigin(formData);
  const fields = readFields(formData, FIELDS);
  // The pickers' labels and the chosen material ride along only so a rejected form
  // can show the choices again.
  const extra = readFields(formData, ["organizationName", "contacts", "materialId"]);
  const contacts = pickedContacts.safeParse(parseJson(extra.contacts));
  const values = {
    ...fields,
    organizationName: extra.organizationName,
    contacts: contacts.success ? extra.contacts : "[]",
    materialId: extra.materialId,
  };
  if (!contacts.success) return { ok: false, message: SEND_REFUSALS.unknown_contact, values };

  const parsed = sendInput.safeParse({
    ...fields,
    contactIds: contacts.data.map(({ id }) => id),
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await logSend(owner.id, parsed.data);
  if (!result.ok) return { ok: false, message: SEND_REFUSALS[result.reason], values };

  refresh();
  redirect(timelineOf(parsed.data, origin));
}

export async function setSendStatusAction(id: string, status: string) {
  const owner = await requireOwner();
  if (!(await setSendStatus(owner.id, z.uuid().parse(id), sendStatus.parse(status)))) {
    notFound();
  }
  refresh();
}

export async function removeSendAction(formData: FormData) {
  const owner = await requireOwner();
  if (!(await removeSend(owner.id, z.uuid().parse(formData.get("id"))))) notFound();
  refresh();
}
