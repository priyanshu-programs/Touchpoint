import { db } from "@/db/client";
import { findSimilarContacts } from "@/modules/contacts/queries";
import {
  emailHolder,
  insertContact,
  ownsOrganization,
} from "@/modules/contacts/service";
import { findSimilarOrganizations } from "@/modules/organizations/queries";
import {
  domainOwner,
  insertOrganization,
} from "@/modules/organizations/service";
import { ownerTimezone } from "@/modules/settings/service";
import { insertTask } from "@/modules/tasks/service";
import {
  insertBoard,
  ownsTemplate,
  roomForBoard,
} from "@/modules/workflows/boards";
import type { QuickAdd } from "./schema";

type Named = { id: string; name: string };

export type QuickAddResult =
  | { ok: true; contactId: string; organizationId: string | null }
  | { ok: false; reason: "duplicate"; kind: "company" | "person"; existing: Named }
  | { ok: false; reason: "similar"; kind: "company" | "person"; candidates: Named[] }
  | { ok: false; reason: "unknown_organization" | "unknown_workflow" | "board_limit" };

// Journey 2 in one transaction. Every check runs before the first write, so a
// refusal leaves nothing behind.
export async function quickAdd(
  ownerId: string,
  { person, company, workflowId, followUp }: QuickAdd,
  options: { confirmSimilar?: boolean } = {},
): Promise<QuickAddResult> {
  return db.transaction(async (tx) => {
    if (company.mode === "existing" && !(await ownsOrganization(tx, ownerId, company.id))) {
      return { ok: false, reason: "unknown_organization" };
    }
    if (workflowId && !(await ownsTemplate(tx, ownerId, workflowId))) {
      return { ok: false, reason: "unknown_workflow" };
    }
    if (
      workflowId &&
      company.mode === "existing" &&
      !(await roomForBoard(tx, ownerId, { organizationId: company.id }))
    ) {
      return { ok: false, reason: "board_limit" };
    }
    if (company.mode === "new" && company.input.domain) {
      const existing = await domainOwner(tx, ownerId, company.input.domain);
      if (existing) return { ok: false, reason: "duplicate", kind: "company", existing };
    }
    if (person.email) {
      const existing = await emailHolder(tx, ownerId, person.email);
      if (existing) {
        return {
          ok: false,
          reason: "duplicate",
          kind: "person",
          existing: { id: existing.id, name: existing.name },
        };
      }
    }
    if (!options.confirmSimilar) {
      if (company.mode === "new") {
        const candidates = await findSimilarOrganizations(tx, ownerId, company.input.name);
        if (candidates.length > 0) {
          return { ok: false, reason: "similar", kind: "company", candidates };
        }
      }
      const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
      const candidates = await findSimilarContacts(
        tx,
        ownerId,
        name,
        company.mode === "existing" ? company.id : null,
      );
      if (candidates.length > 0) {
        return {
          ok: false,
          reason: "similar",
          kind: "person",
          candidates: candidates.map(({ id, name }) => ({ id, name })),
        };
      }
    }

    const organizationId =
      company.mode === "new"
        ? await insertOrganization(tx, ownerId, company.input)
        : company.mode === "existing"
          ? company.id
          : null;
    const contactId = await insertContact(tx, ownerId, { ...person, organizationId });
    if (workflowId) {
      await insertBoard(
        tx,
        ownerId,
        organizationId ? { organizationId } : { contactId },
        { templateId: workflowId },
      );
    }
    if (followUp) {
      await insertTask(
        tx,
        ownerId,
        await ownerTimezone(tx, ownerId),
        {
          title: followUp.title,
          notes: null,
          priority: "normal",
          dueDate: followUp.date,
          dueTime: null,
          repeat: null,
          repeatEvery: 1,
          remindAt: null,
          contactId,
          organizationId,
        },
        "follow_up",
      );
    }
    return { ok: true, contactId, organizationId };
  });
}
