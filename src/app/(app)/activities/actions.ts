"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  activityInput,
  logActivityInput,
} from "@/modules/activities/schema";
import {
  deleteActivity,
  logActivity,
  updateActivity,
  type ActivityResult,
} from "@/modules/activities/service";

const FIELDS = [
  "kind",
  "direction",
  "occurredAt",
  "title",
  "body",
  "outcome",
  "organizationId",
] as const;
const FOLLOW_UP = ["followUpDate", "followUpTitle"] as const;

const pickedContacts = z
  .array(z.strictObject({ id: z.uuid(), label: z.string().max(300) }))
  .max(20);

// An activity shows on every linked record's timeline, and its follow-up on the task views.
const refresh = () => revalidatePath("/", "layout");

function failure(
  result: Exclude<ActivityResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  return {
    ok: false,
    message:
      result.reason === "unknown_contact"
        ? "Choose contacts from the list."
        : "Choose an organization from the list.",
    values,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function read<const Name extends string>(
  formData: FormData,
  names: readonly Name[],
) {
  const fields = readFields(formData, names);
  // The pickers' labels ride along only so a rejected form can show the choices again.
  const labels = readFields(formData, ["organizationName", "contacts"]);
  const contacts = pickedContacts.safeParse(parseJson(labels.contacts));
  return {
    input: {
      ...fields,
      contactIds: contacts.success ? contacts.data.map(({ id }) => id) : [],
    },
    values: {
      ...fields,
      organizationName: labels.organizationName,
      contacts: contacts.success ? labels.contacts : "[]",
    },
    // The picker only ever submits what it was given, so anything else was not typed by hand.
    contactsValid: contacts.success,
  };
}

const BAD_CONTACTS = "Choose contacts from the list.";

const timelineOf = (links: {
  contactIds: string[];
  organizationId: string | null;
}) =>
  links.contactIds[0]
    ? `/people/contacts/${links.contactIds[0]}/timeline`
    : links.organizationId
      ? `/people/organizations/${links.organizationId}/timeline`
      : "/people/contacts";

export async function logActivityAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const { input, values, contactsValid } = read(formData, [
    ...FIELDS,
    ...FOLLOW_UP,
  ]);
  if (!contactsValid) return { ok: false, message: BAD_CONTACTS, values };
  const parsed = logActivityInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await logActivity(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  // Back to the record the activity was logged from.
  if (formData.get("from") === "organization" && parsed.data.organizationId) {
    redirect(`/people/organizations/${parsed.data.organizationId}/timeline`);
  }
  redirect(timelineOf(parsed.data));
}

export async function updateActivityAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const activityId = z.uuid().parse(id);
  const { input, values, contactsValid } = read(formData, FIELDS);
  if (!contactsValid) return { ok: false, message: BAD_CONTACTS, values };
  const parsed = activityInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateActivity(owner.id, activityId, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteActivityAction(formData: FormData) {
  const owner = await requireOwner();
  const removed = await deleteActivity(
    owner.id,
    z.uuid().parse(formData.get("id")),
  );
  if (!removed) notFound();
  refresh();
  redirect(timelineOf(removed));
}
