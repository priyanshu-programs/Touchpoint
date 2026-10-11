"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/settings/actions";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { listContacts } from "@/modules/contacts/queries";
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
  setPrimaryContact,
  setPrimaryEmail,
  updateContact,
  type ContactResult,
} from "@/modules/contacts/service";
import { suggestedPeople } from "@/modules/enrichment/queries";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { contactHref, contactPanelHref } from "../labels";

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
): RecordFormState {
  if (result.reason === "not_found") notFound();
  if (result.reason === "unknown_organization") {
    return {
      ok: false,
      message: "Choose a company from the list.",
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
          href: contactHref(result.existing.id),
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
      href: contactHref(candidate.id),
      label: candidate.name,
    })),
    canConfirm: true,
  };
}

// The picker's label rides along only so a rejected form can show the choice again.
const organizationLabel = (formData: FormData) =>
  readFields(formData, ["organizationName"]);

export async function createContactAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
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
  redirect(contactHref(result.id));
}

// The short form inside a company's panel; everything it does not ask for takes the default.
export async function addCompanyContactAction(
  organizationId: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, [
    "firstName",
    "lastName",
    "jobTitle",
    "email",
    "phoneE164",
  ]);
  const parsed = newContactInput.safeParse({
    ...values,
    organizationId,
    department: "",
    city: "",
    region: "",
    country: "",
    timezone: "",
    preferredChannel: "",
    status: "active",
    relationshipType: "prospect",
    tags: "",
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createContact(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
  });
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  return { ok: true, message: `${parsed.data.firstName} added.` };
}

const suggestedChoice = z.strictObject({
  organizationId: z.uuid(),
  names: z.array(z.string().max(60)).min(1).max(12),
});

// Adds people the website read found. The form carries names only, and each is
// looked up in what the read stored, so nothing else can be created through it.
export async function addSuggestedContactsAction(
  organizationId: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const parsed = suggestedChoice.safeParse({
    organizationId,
    names: formData.getAll("name"),
  });
  if (!parsed.success) return { ok: false, message: "Choose someone to add." };

  const chosen = new Set(parsed.data.names);
  const people = (await suggestedPeople(owner.id, organizationId)).filter(
    (person) => chosen.has(person.name),
  );
  let added = 0;
  for (const person of people) {
    const [firstName, ...rest] = person.name.split(" ");
    const input = newContactInput.safeParse({
      firstName,
      lastName: rest.join(" "),
      organizationId,
      jobTitle: person.title ?? "",
      email: "",
      department: "",
      phoneE164: "",
      city: "",
      region: "",
      country: "",
      timezone: "",
      preferredChannel: "",
      status: "active",
      relationshipType: "prospect",
      tags: "",
    });
    if (!input.success) continue;
    const result = await createContact(owner.id, input.data);
    if (result.ok) added += 1;
  }

  if (added > 0) revalidatePath("/people", "layout");
  const skipped = chosen.size - added;
  if (skipped === 0) return { ok: true, message: `${added} added.` };
  const why = "a contact with a similar name already exists";
  return added > 0
    ? { ok: true, message: `${added} added, ${skipped} left out: ${why}.` }
    : { ok: false, message: `Not added: ${why}.` };
}

// `toPanel` is set when the edit was opened from the company's panel, so saving returns there
// and not to the person's own panel over the people list.
export async function updateContactAction(
  id: string,
  toPanel: boolean,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const contactId = z.uuid().parse(id);
  const fields = readFields(formData, FIELDS);
  const values = { ...fields, ...organizationLabel(formData) };
  const parsed = contactInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateContact(owner.id, contactId, parsed.data);
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  redirect(
    toPanel && parsed.data.organizationId
      ? contactPanelHref(parsed.data.organizationId, contactId)
      : contactHref(contactId),
  );
}

export async function setPrimaryContactAction(formData: FormData) {
  const owner = await requireOwner();
  const { id, primary } = z
    .strictObject({ id: z.uuid(), primary: z.enum(["0", "1"]) })
    .parse(readFields(formData, ["id", "primary"]));
  await setPrimaryContact(owner.id, id, primary === "1");
  revalidatePath("/people", "layout");
}

export async function searchContactsAction(query: string) {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const { rows } = await listContacts(owner.id, { q, limit: 20 });
  return rows.map((row) => ({
    id: row.id,
    label: row.fullName,
    hint: row.organizationName,
  }));
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
  revalidatePath("/people", "layout");
  return { ok: true, message: "Link added." };
}

export async function removeContactLinkAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, linkId } = z
    .strictObject({ contactId: z.uuid(), linkId: z.uuid() })
    .parse(readFields(formData, ["contactId", "linkId"]));
  await removeContactLink(owner.id, contactId, linkId);
  revalidatePath("/people", "layout");
}
