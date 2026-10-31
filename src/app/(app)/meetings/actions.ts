"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { companyHref, contactTabHref } from "@/app/(app)/people/labels";
import { readFields, readOrigin } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { meetingInput } from "@/modules/integrations/schema";
import { checkMeeting, scheduleMeeting } from "@/modules/integrations/scheduling";

const FIELDS = [
  "key",
  "title",
  "startsAt",
  "endsAt",
  "location",
  "notes",
  "emailGuests",
  "addMeet",
] as const;

const pickedContacts = z
  .array(z.strictObject({ id: z.uuid(), label: z.string().max(300) }))
  .max(20);

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// In the panel it was asked for from, or on its own page. Built from ids, never from an
// address the browser sent; the page then checks them against the owner.
const landing = (
  meetingId: string,
  contactId: string,
  origin: ReturnType<typeof readOrigin>,
) => {
  if (origin.from === "organization" && origin.inside) {
    return `${companyHref(origin.inside, "activity")}&event=${meetingId}`;
  }
  if (origin.from === "contact") {
    return `${contactTabHref(contactId, "activity", origin.inside || undefined)}&event=${meetingId}`;
  }
  return `/meetings/${meetingId}`;
};

// Without `confirmed` this only checks the form and says what Google will do. Google is
// called only by a second press, on that sentence.
export async function scheduleMeetingAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const origin = readOrigin(formData);
  const fields = readFields(formData, FIELDS);
  const { contacts: picked } = readFields(formData, ["contacts"]);
  const contacts = pickedContacts.safeParse(parseJson(picked));
  const values = { ...fields, contacts: contacts.success ? picked : "[]" };
  if (!contacts.success) {
    return { ok: false, message: "Choose people from the list.", values };
  }

  const parsed = meetingInput.safeParse({
    ...fields,
    contactIds: contacts.data.map(({ id }) => id),
  });
  if (!parsed.success) return invalid(parsed.error, values);

  if (formData.get("confirmed") !== "yes") {
    const checked = await checkMeeting(owner.id, parsed.data);
    return checked.ok
      ? { ok: false, message: "", values, confirm: checked.summary }
      : { ok: false, message: checked.message, values };
  }

  const result = await scheduleMeeting(owner.id, parsed.data);
  if (!result.ok) {
    // Stays on the confirmation while it can still go through, so "press Schedule again" is
    // there to press, with the same details that may already have reached Google.
    const again = await checkMeeting(owner.id, parsed.data);
    return {
      ok: false,
      message: result.message,
      values,
      ...(again.ok && { confirm: again.summary }),
    };
  }

  revalidatePath("/", "layout");
  if (result.meetingId === null) return { ok: true, message: result.message };
  redirect(landing(result.meetingId, parsed.data.contactIds[0], origin));
}
