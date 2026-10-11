"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/settings/actions";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  contactEmailInput,
  contactInput,
  contactLinkInput,
  newContactInput,
} from "@/modules/contacts/schema";
import {
  addContactEmail,
  addContactLink,
  createContact,
  removeContactEmail,
  removeContactLink,
  setContactArchived,
  setPrimaryEmail,
  updateContact,
  type ContactResult,
} from "@/modules/contacts/service";
import { invalid, type PeopleFormState } from "../form-state";

const FIELDS = [
  "firstName",
  "lastName",
  "organizationId",
  "jobTitle",
  "department",
  "phoneE164",
  "city",
  "region",
  "country",
  "timezone",
  "preferredChannel",
  "status",
  "relationshipType",
  "tags",
] as const;

function failure(
  result: Exclude<ContactResult, { ok: true }>,
  values: Record<string, string>,
): PeopleFormState {
  if (result.reason === "not_found") notFound();
  if (result.reason === "unknown_organization") {
    return {
      ok: false,
      message: "Choose an organization from the list.",
      values,
    };
  }
  if (result.reason === "duplicate") {
    return {
      ok: false,
      message: `That email already belongs to ${result.existing.name}.`,
      values,
      links: [
        {
          href: `/people/contacts/${result.existing.id}`,
          label: result.existing.name,
        },
      ],
    };
  }
  return {
    ok: false,
    message:
      "A contact with a similar name already exists. Check before creating another.",
    values,
    links: result.candidates.map((candidate) => ({
      href: `/people/contacts/${candidate.id}`,
      label: candidate.name,
    })),
    canConfirm: true,
  };
}

// The picker's label rides along only so a rejected form can show the choice again.
const organizationLabel = (formData: FormData) =>
  readFields(formData, ["organizationName"]);

export async function createContactAction(
  _previous: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const owner = await requireOwner();
  const fields = readFields(formData, [...FIELDS, "email"]);
  const values = { ...fields, ...organizationLabel(formData) };
  const parsed = newContactInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createContact(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
  });
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  redirect(`/people/contacts/${result.id}`);
}

export async function updateContactAction(
  id: string,
  _previous: PeopleFormState,
  formData: FormData,
): Promise<PeopleFormState> {
  const owner = await requireOwner();
  const contactId = z.uuid().parse(id);
  const fields = readFields(formData, FIELDS);
  const values = { ...fields, ...organizationLabel(formData) };
  const parsed = contactInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateContact(owner.id, contactId, parsed.data);
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  redirect(`/people/contacts/${contactId}`);
}

export async function setContactArchivedAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  await setContactArchived(owner.id, id, formData.get("archived") === "1");
  revalidatePath("/people", "layout");
}

export async function addContactEmailAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const contactId = z.uuid().parse(id);
  const parsed = contactEmailInput.safeParse(
    readFields(formData, ["email", "label"]),
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const result = await addContactEmail(owner.id, contactId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      ok: false,
      message: `That email already belongs to ${result.existing.name}.`,
    };
  }
  revalidatePath("/people", "layout");
  return { ok: true, message: "Email added." };
}

const emailTarget = z.strictObject({ contactId: z.uuid(), emailId: z.uuid() });

export async function removeContactEmailAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, emailId } = emailTarget.parse(
    readFields(formData, ["contactId", "emailId"]),
  );
  await removeContactEmail(owner.id, contactId, emailId);
  revalidatePath("/people", "layout");
}

export async function setPrimaryEmailAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, emailId } = emailTarget.parse(
    readFields(formData, ["contactId", "emailId"]),
  );
  await setPrimaryEmail(owner.id, contactId, emailId);
  revalidatePath("/people", "layout");
}

export async function addContactLinkAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const contactId = z.uuid().parse(id);
  const parsed = contactLinkInput.safeParse(
    readFields(formData, ["kind", "url"]),
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  if (!(await addContactLink(owner.id, contactId, parsed.data))) notFound();
  revalidatePath(`/people/contacts/${contactId}`);
  return { ok: true, message: "Link added." };
}

export async function removeContactLinkAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, linkId } = z
    .strictObject({ contactId: z.uuid(), linkId: z.uuid() })
    .parse(readFields(formData, ["contactId", "linkId"]));
  await removeContactLink(owner.id, contactId, linkId);
  revalidatePath(`/people/contacts/${contactId}`);
}
