"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/app/(app)/settings/actions";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { getContact, listContacts } from "@/modules/contacts/queries";
import {
  companyLinkInput,
  contactEmailInput,
  contactInput,
  contactLinkInput,
  contactMerge,
  newContactInput,
  RELATIONSHIP_TYPES,
} from "@/modules/contacts/schema";
import {
  addContactCompany,
  addContactEmail,
  addContactLink,
  createContact,
  deleteContact,
  removeContactCompany,
  removeContactEmail,
  removeContactLink,
  setContactArchived,
  setContactCompanyTitle,
  setContactRelationship,
  setPrimaryContact,
  setPrimaryEmail,
  updateContact,
  type ContactResult,
} from "@/modules/contacts/service";
import { MAX_MERGED_TAGS, mergeContacts } from "@/modules/contacts/merge";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { removeContactPhoto, requestPhoto } from "@/modules/enrichment/photos";
import {
  acceptProfile,
  dismissProfiles,
  requestProfileSearch,
} from "@/modules/enrichment/profiles";
import { suggestedPeople } from "@/modules/enrichment/queries";
import { runDueJobs } from "@/modules/jobs/service";
import { handlers } from "@/modules/jobs/tick";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readCustomValues } from "../fields/custom-values";
import { companyHref, contactHref, contactPanelHref } from "../labels";

const FIELDS = [
  "firstName",
  "lastName",
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

// `organizationId` is the company the contact was being added to: people already
// there are named, but not offered as someone to add to it.
function failure(
  result: Exclude<ContactResult, { ok: true }>,
  values: Record<string, string>,
  organizationId?: string,
): RecordFormState {
  const elsewhere = (people: Extract<ContactResult, { existing: unknown }>["existing"][]) =>
    people
      .filter(({ companies }) => !companies.some(({ id }) => id === organizationId))
      .map(({ id, name }) => ({ id, name }));
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
      people: elsewhere([result.existing]),
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
    people: elsewhere(result.candidates),
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
  const fields = readFields(formData, [...FIELDS, "organizationId", "email"]);
  const custom = await readCustomValues(owner.id, "contact", formData);
  const values = { ...fields, ...organizationLabel(formData), ...custom.typed };
  const parsed = newContactInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);
  if (!custom.parsed.success) return invalid(custom.parsed.error, values);

  const result = await createContact(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
    custom: custom.parsed.data,
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
  if (!result.ok) return failure(result, values, organizationId);

  revalidatePath("/people", "layout");
  return { ok: true, message: `${parsed.data.firstName} added.` };
}

const linkTarget = z.strictObject({
  contactId: z.uuid(),
  organizationId: z.uuid(),
});

async function linkCompany(
  ownerId: string,
  ids: { contactId: string; organizationId: string },
  jobTitle: string,
  values: Record<string, string>,
): Promise<RecordFormState> {
  const target = linkTarget.safeParse(ids);
  if (!target.success) {
    return { ok: false, message: "Choose from the list.", values };
  }
  const link = companyLinkInput.safeParse({ jobTitle });
  if (!link.success) return invalid(link.error, values);

  const result = await addContactCompany(
    ownerId,
    target.data.contactId,
    target.data.organizationId,
    link.data,
  );
  if (!result.ok) {
    if (result.reason !== "already") notFound();
    return { ok: false, message: "They are already at this company.", values };
  }
  revalidatePath("/people", "layout");
  return { ok: true, message: "Added to this company." };
}

// From a company: puts someone already among the contacts there too.
export async function addExistingContactAction(
  organizationId: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["contactId", "contactName", "jobTitle"]);
  return linkCompany(
    owner.id,
    { contactId: values.contactId, organizationId },
    values.jobTitle,
    values,
  );
}

// From a person: the same link, made from the other side.
export async function addContactCompanyAction(
  contactId: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, [
    "organizationId",
    "organizationName",
    "jobTitle",
  ]);
  return linkCompany(
    owner.id,
    { contactId, organizationId: values.organizationId },
    values.jobTitle,
    values,
  );
}

export async function removeContactCompanyAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, organizationId } = linkTarget.parse(
    readFields(formData, ["contactId", "organizationId"]),
  );
  await removeContactCompany(owner.id, contactId, organizationId);
  revalidatePath("/people", "layout");
}

export async function setContactCompanyTitleAction(formData: FormData) {
  const owner = await requireOwner();
  const fields = readFields(formData, ["contactId", "organizationId", "jobTitle"]);
  const { contactId, organizationId } = linkTarget.parse({
    contactId: fields.contactId,
    organizationId: fields.organizationId,
  });
  const { jobTitle } = companyLinkInput.parse({ jobTitle: fields.jobTitle });
  await setContactCompanyTitle(owner.id, contactId, organizationId, jobTitle);
  revalidatePath("/people", "layout");
}

const suggestedMatch = z.strictObject({
  organizationId: z.uuid(),
  name: z.string().min(1).max(60),
  contactId: z.uuid(),
});

// Says a person the website names is someone already among the contacts. The pair
// is accepted only if the server itself offered it, so the form can link nobody else.
export async function linkSuggestedContactAction(
  organizationId: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const parsed = suggestedMatch.safeParse({
    organizationId,
    ...readFields(formData, ["name", "contactId"]),
  });
  if (!parsed.success) return { ok: false, message: "Choose someone to add." };

  const person = (await suggestedPeople(owner.id, organizationId)).find(
    (suggested) => suggested.name === parsed.data.name,
  );
  const match = person?.matches.find(({ id }) => id === parsed.data.contactId);
  if (!person || !match) return { ok: false, message: "Choose someone to add." };

  const result = await addContactCompany(owner.id, match.id, organizationId, {
    jobTitle: person.title,
    listedAs:
      person.name.toLowerCase() === match.name.toLowerCase() ? null : person.name,
  });
  if (!result.ok) {
    return { ok: false, message: `${match.name} is already at this company.` };
  }
  if (person.photo && !(await getContact(owner.id, match.id))?.photoVersion) {
    await requestPhoto(owner.id, match.id, person.photo);
    after(() => runDueJobs(handlers, 10_000));
  }
  revalidatePath("/people", "layout");
  return { ok: true, message: `${match.name} added.` };
}

const suggestedChoice = z
  .strictObject({
    organizationId: z.uuid(),
    names: z.array(z.string().max(60)).max(12),
    // Named by the owner as a new person although someone similar exists.
    confirmed: z.array(z.string().max(60)).max(12),
  })
  .refine((choice) => choice.names.length + choice.confirmed.length > 0);

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
    confirmed: formData.getAll("confirmed"),
  });
  if (!parsed.success) return { ok: false, message: "Choose someone to add." };

  const confirmed = new Set(parsed.data.confirmed);
  const chosen = new Set([...parsed.data.names, ...confirmed]);
  const people = (await suggestedPeople(owner.id, organizationId)).filter(
    (person) => chosen.has(person.name),
  );
  let added = 0;
  let pictured = false;
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
    const result = await createContact(owner.id, input.data, {
      confirmSimilar: confirmed.has(person.name),
    });
    if (!result.ok) continue;
    added += 1;
    if (person.photo) {
      await requestPhoto(owner.id, result.id, person.photo);
      pictured = true;
    }
  }

  // The pictures would otherwise wait for the scheduler, up to fifteen minutes away.
  if (pictured) after(() => runDueJobs(handlers, 10_000));
  if (added > 0) revalidatePath("/people", "layout");
  const skipped = chosen.size - added;
  if (skipped === 0) return { ok: true, message: `${added} added.` };
  const why = "a contact with a similar name already exists";
  return added > 0
    ? { ok: true, message: `${added} added, ${skipped} left out: ${why}.` }
    : { ok: false, message: `Not added: ${why}.` };
}

// `companyId` is the company whose panel the edit was opened from, so saving returns there
// and not to the person's own panel over the people list.
export async function updateContactAction(
  id: string,
  companyId: string | null,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const contactId = z.uuid().parse(id);
  const company = z.uuid().nullable().parse(companyId);
  const standard = readFields(formData, FIELDS);
  const custom = await readCustomValues(owner.id, "contact", formData);
  const values = { ...standard, ...custom.typed };
  const parsed = contactInput.safeParse(standard);
  if (!parsed.success) return invalid(parsed.error, values);
  if (!custom.parsed.success) return invalid(custom.parsed.error, values);

  const result = await updateContact(
    owner.id,
    contactId,
    parsed.data,
    custom.parsed.data,
  );
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  redirect(
    company ? contactPanelHref(company, contactId) : contactHref(contactId),
  );
}

export async function setPrimaryContactAction(formData: FormData) {
  const owner = await requireOwner();
  const { id, organizationId, primary } = z
    .strictObject({
      id: z.uuid(),
      organizationId: z.uuid(),
      primary: z.enum(["0", "1"]),
    })
    .parse(readFields(formData, ["id", "organizationId", "primary"]));
  await setPrimaryContact(owner.id, id, organizationId, primary === "1");
  revalidatePath("/people", "layout");
}

export async function searchContactsAction(query: string) {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const { rows } = await listContacts(owner.id, { q, limit: 20 });
  return rows.map((row) => ({
    id: row.id,
    label: row.fullName,
    hint: row.companies.map((company) => company.name).join(", ") || null,
  }));
}

export async function setContactArchivedAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  await setContactArchived(owner.id, id, formData.get("archived") === "1");
  revalidatePath("/people", "layout");
}

export async function setContactRelationshipAction(
  id: string,
  relationshipType: string,
) {
  const owner = await requireOwner();
  const changed = await setContactRelationship(
    owner.id,
    z.uuid().parse(id),
    z.enum(RELATIONSHIP_TYPES).parse(relationshipType),
  );
  if (!changed) notFound();
  revalidatePath("/people", "layout");
}

export async function removeContactPhotoAction(formData: FormData) {
  const owner = await requireOwner();
  await removeContactPhoto(owner.id, z.uuid().parse(formData.get("id")));
  revalidatePath("/people", "layout");
}

// `company` is an id, never an address: the company whose panel the person was open in.
export async function deleteContactAction(formData: FormData) {
  const owner = await requireOwner();
  const { id, company } = z
    .strictObject({ id: z.uuid(), company: z.union([z.literal(""), z.uuid()]) })
    .parse(readFields(formData, ["id", "company"]));
  const result = await deleteContact(owner.id, id);
  if (!result.ok && result.reason === "not_found") notFound();
  revalidatePath("/people", "layout");
  // A person their invoices bill stays; their panel already says why.
  if (result.ok) redirect(company ? companyHref(company, "contacts") : "/people/contacts");
}

// The choices arrive as `pick.<field>` and `custom.<key>`, each naming a side, never a
// value. `company` is the company whose panel the merge was opened in.
export async function mergeContactsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const picks: Record<string, FormDataEntryValue> = {};
  const custom: Record<string, FormDataEntryValue> = {};
  for (const [name, value] of formData) {
    if (name.startsWith("pick.")) picks[name.slice(5)] = value;
    if (name.startsWith("custom.")) custom[name.slice(7)] = value;
  }
  const { company } = z
    .strictObject({ company: z.union([z.literal(""), z.uuid()]) })
    .parse(readFields(formData, ["company"]));
  const parsed = contactMerge.safeParse({
    ...readFields(formData, ["keep", "other"]),
    picks,
    custom,
  });
  if (!parsed.success) {
    return { ok: false, message: "This merge could not be read. Open it again." };
  }
  const result = await mergeContacts(owner.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      ok: false,
      message:
        result.reason === "tags"
          ? `Together they have ${result.count} tags. Remove some first: a person can have at most ${MAX_MERGED_TAGS}.`
          : `Together they have ${result.count} workflows. Remove some first: a person can have at most ${MAX_RECORD_BOARDS}.`,
    };
  }
  revalidatePath("/people", "layout");
  redirect(
    company
      ? contactPanelHref(company, parsed.data.keep)
      : contactHref(parsed.data.keep),
  );
}

// The rows ticked on one page of the list, which holds 50.
const tickedIds = z.array(z.uuid()).min(1).max(50);

export async function archiveContactsAction(ids: string[], archived: boolean) {
  const owner = await requireOwner();
  const to = z.boolean().parse(archived);
  for (const id of tickedIds.parse(ids)) {
    await setContactArchived(owner.id, id, to);
  }
  revalidatePath("/people", "layout");
}

// How many were kept because invoices bill them.
export async function deleteContactsAction(ids: string[]) {
  const owner = await requireOwner();
  let kept = 0;
  for (const id of tickedIds.parse(ids)) {
    const result = await deleteContact(owner.id, id);
    if (!result.ok && result.reason === "invoiced") kept += 1;
  }
  revalidatePath("/people", "layout");
  return kept;
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

const SEARCH_REFUSALS = {
  disabled: "Searching by name is not set up.",
  rate_limited: "Too many searches for now. Try again later.",
  refused_key: "The search service refused the key. Check TAVILY_API_KEY.",
  used_up: "This month's free searches are used up.",
  unavailable: "The search service did not answer.",
};

// Sends the person's name and one company name out to look for their profiles.
export async function findProfilesAction(id: string): Promise<FormState> {
  const owner = await requireOwner();
  const result = await requestProfileSearch(owner.id, z.uuid().parse(id));
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { ok: false, message: SEARCH_REFUSALS[result.reason] };
  }
  revalidatePath("/people", "layout");
  return result.found > 0
    ? { ok: true, message: `${result.found} found.` }
    : { ok: true, message: "Nothing found." };
}

// The form carries an address only, and it is added only if the search offered it.
export async function addProfileAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, url } = z
    .strictObject({ contactId: z.uuid(), url: z.string().max(200) })
    .parse(readFields(formData, ["contactId", "url"]));
  await acceptProfile(owner.id, contactId, url);
  revalidatePath("/people", "layout");
}

export async function dismissProfilesAction(formData: FormData) {
  const owner = await requireOwner();
  await dismissProfiles(owner.id, z.uuid().parse(formData.get("id")));
  revalidatePath("/people", "layout");
}

export async function removeContactLinkAction(formData: FormData) {
  const owner = await requireOwner();
  const { contactId, linkId } = z
    .strictObject({ contactId: z.uuid(), linkId: z.uuid() })
    .parse(readFields(formData, ["contactId", "linkId"]));
  await removeContactLink(owner.id, contactId, linkId);
  revalidatePath("/people", "layout");
}
