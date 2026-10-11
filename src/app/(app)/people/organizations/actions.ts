"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { listOrganizations } from "@/modules/organizations/queries";
import { organizationInput } from "@/modules/organizations/schema";
import {
  createOrganization,
  setOrganizationArchived,
  updateOrganization,
  type OrganizationResult,
} from "@/modules/organizations/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";

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
          href: `/people/organizations/${result.existing.id}`,
          label: result.existing.name,
        },
      ],
    };
  }
  return {
    ok: false,
    message:
      "An organization with a similar name already exists. Check it before creating another.",
    values,
    links: result.candidates.map((candidate) => ({
      href: `/people/organizations/${candidate.id}`,
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

  revalidatePath("/people/organizations");
  redirect(`/people/organizations/${result.id}`);
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
  redirect(`/people/organizations/${organizationId}`);
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
