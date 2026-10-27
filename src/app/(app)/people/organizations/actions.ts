"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { requestEnrichment } from "@/modules/enrichment/service";
import { runDueJobs } from "@/modules/jobs/service";
import { handlers } from "@/modules/jobs/tick";
import { listOrganizations } from "@/modules/organizations/queries";
import { MAX_MERGED_TAGS } from "@/modules/contacts/merge";
import { mergeOrganizations } from "@/modules/organizations/merge";
import {
  organizationInput,
  organizationMerge,
} from "@/modules/organizations/schema";
import {
  createOrganization,
  deleteOrganization,
  setOrganizationArchived,
  setOrganizationStatus,
  updateOrganization,
  type OrganizationResult,
} from "@/modules/organizations/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import type { FormState } from "@/app/(app)/settings/actions";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { readCustomValues } from "../fields/custom-values";
import { companyHref } from "../labels";

const FIELDS = [
  "name",
  "domain",
  "website",
  "phone",
  "email",
  "industry",
  "description",
  "city",
  "region",
  "country",
  "status",
  "tags",
] as const;

// The queued read would otherwise wait for the scheduler, up to fifteen minutes away.
function readWebsiteSoon() {
  after(() => runDueJobs(handlers, 10_000));
}

function failure(
  result: Exclude<OrganizationResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  if (result.reason === "unknown_status") {
    return {
      ok: false,
      message: "That status no longer exists. Choose another.",
      values,
    };
  }
  if (result.reason === "duplicate") {
    return {
      ok: false,
      message: `That domain already belongs to ${result.existing.name}.`,
      values,
      links: [
        {
          href: companyHref(result.existing.id),
          label: result.existing.name,
        },
      ],
    };
  }
  return {
    ok: false,
    message:
      "A company with a similar name already exists. Check it before creating another.",
    values,
    links: result.candidates.map((candidate) => ({
      href: companyHref(candidate.id),
      label: candidate.name,
    })),
    canConfirm: true,
  };
}

export async function createOrganizationAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const standard = readFields(formData, FIELDS);
  const custom = await readCustomValues(owner.id, "organization", formData);
  const values = { ...standard, ...custom.typed };
  const parsed = organizationInput.safeParse(standard);
  if (!parsed.success) return invalid(parsed.error, values);
  if (!custom.parsed.success) return invalid(custom.parsed.error, values);

  const result = await createOrganization(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
    custom: custom.parsed.data,
  });
  if (!result.ok) return failure(result, values);

  if (parsed.data.domain || parsed.data.website) readWebsiteSoon();
  revalidatePath("/people/organizations");
  redirect(companyHref(result.id));
}

// The short form: a name and, optionally, a website the domain is read from.
export async function createCompanyQuickAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "website"]);
  const typed = values.website.trim();
  const website =
    typed && !/^[a-z][a-z0-9+.-]*:/i.test(typed) ? `https://${typed}` : typed;
  const parsed = organizationInput.safeParse({
    name: values.name,
    domain: website,
    website,
    phone: "",
    email: "",
    industry: "",
    description: "",
    city: "",
    region: "",
    country: "",
    status: "prospect",
    tags: "",
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createOrganization(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
  });
  if (!result.ok) return failure(result, values);

  if (parsed.data.domain || parsed.data.website) readWebsiteSoon();
  revalidatePath("/people/organizations");
  redirect(companyHref(result.id));
}

export type EnrichCompanyState = { message: string } | null;

export async function enrichCompanyAction(
  id: string,
): Promise<EnrichCompanyState> {
  const owner = await requireOwner();
  const organizationId = z.uuid().parse(id);
  const result = await db.transaction((tx) =>
    requestEnrichment(owner.id, organizationId, tx),
  );
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      message:
        result.reason === "no_website"
          ? "Add a website to this company first."
          : result.reason === "busy"
            ? "The website is already being read."
            : "That was tried a moment ago. Wait a minute and try again.",
    };
  }

  readWebsiteSoon();
  revalidatePath("/people/organizations");
  return null;
}

export async function updateOrganizationAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const organizationId = z.uuid().parse(id);
  const standard = readFields(formData, FIELDS);
  const custom = await readCustomValues(owner.id, "organization", formData);
  const values = { ...standard, ...custom.typed };
  const parsed = organizationInput.safeParse(standard);
  if (!parsed.success) return invalid(parsed.error, values);
  if (!custom.parsed.success) return invalid(custom.parsed.error, values);

  const result = await updateOrganization(
    owner.id,
    organizationId,
    parsed.data,
    custom.parsed.data,
  );
  if (!result.ok) return failure(result, values);

  revalidatePath("/people", "layout");
  redirect(companyHref(organizationId));
}

export async function setOrganizationArchivedAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  await setOrganizationArchived(
    owner.id,
    id,
    formData.get("archived") === "1",
  );
  revalidatePath("/people", "layout");
}

export async function setOrganizationStatusAction(id: string, status: string) {
  const owner = await requireOwner();
  const changed = await setOrganizationStatus(
    owner.id,
    z.uuid().parse(id),
    organizationInput.shape.status.parse(status),
  );
  if (!changed) notFound();
  revalidatePath("/people", "layout");
}

export async function deleteOrganizationAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  const result = await deleteOrganization(owner.id, id);
  if (!result.ok && result.reason === "not_found") notFound();
  revalidatePath("/people", "layout");
  // A company its invoices bill stays; its panel already says why.
  if (result.ok) redirect("/people/organizations");
}

// The rows ticked on one page of the list, which holds 50.
const tickedIds = z.array(z.uuid()).min(1).max(50);

export async function archiveOrganizationsAction(
  ids: string[],
  archived: boolean,
) {
  const owner = await requireOwner();
  const to = z.boolean().parse(archived);
  for (const id of tickedIds.parse(ids)) {
    await setOrganizationArchived(owner.id, id, to);
  }
  revalidatePath("/people", "layout");
}

// How many were kept because invoices bill them.
export async function deleteOrganizationsAction(ids: string[]) {
  const owner = await requireOwner();
  let kept = 0;
  for (const id of tickedIds.parse(ids)) {
    const result = await deleteOrganization(owner.id, id);
    if (!result.ok && result.reason === "invoiced") kept += 1;
  }
  revalidatePath("/people", "layout");
  return kept;
}

export async function searchOrganizationsAction(query: string) {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const { rows } = await listOrganizations(owner.id, { q, limit: 20 });
  return rows.map((row) => ({ id: row.id, label: row.name, hint: row.domain }));
}

export async function mergeOrganizationsAction(
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
  const parsed = organizationMerge.safeParse({
    ...readFields(formData, ["keep", "other"]),
    picks,
    custom,
  });
  if (!parsed.success) {
    return { ok: false, message: "This merge could not be read. Open it again." };
  }
  const result = await mergeOrganizations(owner.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      ok: false,
      message:
        result.reason === "reading"
          ? "A website read is under way on one of them. Try again in a minute, once it has finished."
          : result.reason === "tags"
            ? `Together they have ${result.count} tags. Remove some first: a company can have at most ${MAX_MERGED_TAGS}.`
            : `Together they have ${result.count} workflows. Remove some first: a company can have at most ${MAX_RECORD_BOARDS}.`,
    };
  }
  revalidatePath("/people", "layout");
  redirect(companyHref(parsed.data.keep));
}
