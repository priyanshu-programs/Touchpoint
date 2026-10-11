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
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  setOrganizationArchived,
  updateOrganization,
  type OrganizationResult,
} from "@/modules/organizations/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { companyHref } from "../labels";

const FIELDS = [
  "name",
  "domain",
  "website",
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
  const values = readFields(formData, FIELDS);
  const parsed = organizationInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createOrganization(owner.id, parsed.data, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
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
  const values = readFields(formData, FIELDS);
  const parsed = organizationInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateOrganization(owner.id, organizationId, parsed.data);
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

export async function searchOrganizationsAction(query: string) {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const { rows } = await listOrganizations(owner.id, { q, limit: 20 });
  return rows.map((row) => ({ id: row.id, label: row.name, hint: row.domain }));
}
