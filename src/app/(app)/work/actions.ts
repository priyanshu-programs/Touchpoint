"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  engagementContactInput,
  engagementInput,
  engagementStatus,
  MAX_ENGAGEMENT_CONTACTS,
  MAX_ENGAGEMENTS,
} from "@/modules/engagements/schema";
import {
  addEngagementContact,
  createEngagement,
  deleteEngagement,
  removeEngagementContact,
  setEngagementStatus,
  updateEngagement,
  type EngagementResult,
} from "@/modules/engagements/service";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { engagementHref } from "./labels";

const FIELDS = [
  "organizationId",
  "title",
  "status",
  "currency",
  "value",
  "paymentTerms",
  "startDate",
  "targetEndDate",
  "scope",
  "objectives",
] as const;

function refresh() {
  revalidatePath("/work", "layout");
  revalidatePath("/people", "layout");
}

function failure(
  result: Exclude<EngagementResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  return {
    ok: false,
    message:
      result.reason === "limit"
        ? `You have ${MAX_ENGAGEMENTS} engagements, the most there can be. Delete one you no longer need first.`
        : "That company no longer exists. Choose another.",
    values,
  };
}

// The picker's label comes back with the values so a refused form still names the company.
const readValues = (formData: FormData) =>
  readFields(formData, [...FIELDS, "organizationName"]);

export async function createEngagementAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readValues(formData);
  const parsed = engagementInput.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createEngagement(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  redirect(engagementHref(result.id));
}

export async function updateEngagementAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const engagementId = z.uuid().parse(id);
  const values = readValues(formData);
  const parsed = engagementInput.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateEngagement(owner.id, engagementId, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  redirect(engagementHref(engagementId));
}

export async function setEngagementStatusAction(id: string, status: string) {
  const owner = await requireOwner();
  const changed = await setEngagementStatus(
    owner.id,
    z.uuid().parse(id),
    engagementStatus.parse(status),
  );
  if (!changed) notFound();
  refresh();
}

export async function deleteEngagementAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  if (!(await deleteEngagement(owner.id, id))) notFound();
  refresh();
  redirect("/work");
}

export async function addEngagementContactAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const engagementId = z.uuid().parse(id);
  const parsed = engagementContactInput.safeParse(
    readFields(formData, ["contactId", "role"]),
  );
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const result = await addEngagementContact(owner.id, engagementId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      ok: false,
      message:
        result.reason === "already_added"
          ? "That person is already on this engagement."
          : result.reason === "limit"
            ? `An engagement holds at most ${MAX_ENGAGEMENT_CONTACTS} people.`
            : "That person no longer exists. Choose another.",
    };
  }

  refresh();
  return { ok: true, message: "Added." };
}

export async function removeEngagementContactAction(formData: FormData) {
  const owner = await requireOwner();
  const { id, contactId } = z
    .strictObject({ id: z.uuid(), contactId: z.uuid() })
    .parse(readFields(formData, ["id", "contactId"]));
  if (!(await removeEngagementContact(owner.id, id, contactId))) notFound();
  refresh();
}
