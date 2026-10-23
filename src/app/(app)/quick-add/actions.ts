"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { runDueJobs } from "@/modules/jobs/service";
import { handlers } from "@/modules/jobs/tick";
import {
  COMPANY_MODES,
  quickAddInput,
  toQuickAdd,
} from "@/modules/quick-add/schema";
import { quickAdd, type QuickAddResult } from "@/modules/quick-add/service";
import {
  companyHref,
  contactHref,
  contactPanelHref,
} from "../people/labels";

const SHARED = [
  "firstName",
  "lastName",
  "jobTitle",
  "email",
  "workflowId",
  "followUpDate",
  "followUpTitle",
] as const;
const BY_MODE = {
  none: [],
  existing: ["organizationId"],
  new: ["companyName", "companyWebsite"],
} as const;

const hrefOf = (kind: "company" | "person", id: string) =>
  kind === "company" ? companyHref(id) : contactHref(id);

function failure(
  result: Exclude<QuickAddResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  switch (result.reason) {
    case "unknown_organization":
      return { ok: false, message: "Choose a company from the list.", values };
    case "unknown_workflow":
      return { ok: false, message: "Choose a workflow from the list.", values };
    case "board_limit":
      return {
        ok: false,
        message: "That company already has 20 workflows. Choose no workflow, or remove one first.",
        values,
      };
    case "duplicate":
      return {
        ok: false,
        message:
          result.kind === "company"
            ? `That domain already belongs to ${result.existing.name}.`
            : `That email already belongs to ${result.existing.name}.`,
        values,
        links: [{ href: hrefOf(result.kind, result.existing.id), label: result.existing.name }],
      };
    case "similar":
      return {
        ok: false,
        message:
          result.kind === "company"
            ? "A company with a similar name already exists. Check before adding another."
            : "A person with a similar name already exists. Check before adding another.",
        values,
        links: result.candidates.map(({ id, name }) => ({
          href: hrefOf(result.kind, id),
          label: name,
        })),
        canConfirm: true,
      };
  }
}

export async function quickAddAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const mode = COMPANY_MODES.find((value) => value === formData.get("companyMode"));
  if (!mode) return { ok: false, message: "Choose where they work." };
  const fields = readFields(formData, [...SHARED, ...BY_MODE[mode]]);
  const values = {
    ...fields,
    companyMode: mode,
    organizationLabel: String(formData.get("organizationLabel") ?? ""),
  };
  const parsed = quickAddInput.safeParse({ ...fields, companyMode: mode });
  if (!parsed.success) return invalid(parsed.error, values);
  const input = toQuickAdd(parsed.data);
  if (!input.ok) return invalid(input.error, values);

  const result = await quickAdd(owner.id, input.value, {
    confirmSimilar: formData.get("confirmSimilar") === "yes",
  });
  if (!result.ok) return failure(result, values);

  const { company } = input.value;
  if (company.mode === "new" && (company.input.domain || company.input.website)) {
    after(() => runDueJobs(handlers, 10_000));
  }
  revalidatePath("/people", "layout");
  revalidatePath("/workflows");
  redirect(
    result.organizationId
      ? contactPanelHref(result.organizationId, result.contactId)
      : contactHref(result.contactId),
  );
}
