"use server";

import { z } from "zod";
import { companyHref, contactHref, labelFor } from "@/app/(app)/people/labels";
import { requireOwner } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/time";
import { INVOICE_STATUS_LABELS } from "@/modules/invoices/schema";
import { MATERIAL_TYPE_LABELS } from "@/modules/materials/schema";
import { searchEverything } from "@/modules/search/queries";
import { getSettings } from "@/modules/settings/service";

export type SearchHit = {
  id: string;
  label: string;
  hint: string | null;
  href: string;
};

export type SearchGroups = {
  companies: SearchHit[];
  people: SearchHit[];
  materials: SearchHit[];
  invoices: SearchHit[];
  workflows: SearchHit[];
  brainstorms: SearchHit[];
  activities: SearchHit[];
  tasks: SearchHit[];
};

// Every address is built here from a stored id; nothing the browser sends becomes one.
export async function searchEverythingAction(
  query: string,
): Promise<SearchGroups | null> {
  const owner = await requireOwner();
  const q = z.string().max(100).parse(query);
  const [found, settings] = await Promise.all([
    searchEverything(owner.id, q),
    getSettings(owner.id),
  ]);
  if (!found) return null;
  const timezone = settings?.timezone ?? "UTC";

  return {
    companies: found.companies.map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.domain,
      href: companyHref(row.id),
    })),
    people: found.people.map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.companies.map((company) => company.name).join(", ") || null,
      href: contactHref(row.id),
    })),
    materials: found.materials.map((row) => ({
      id: row.id,
      label: row.name,
      hint: MATERIAL_TYPE_LABELS[row.type],
      href: `/materials/${row.id}`,
    })),
    invoices: found.invoices.map((row) => ({
      id: row.id,
      label: row.number,
      hint: `${row.client} · ${INVOICE_STATUS_LABELS[row.status]}`,
      href: `/money/invoices/${row.id}`,
    })),
    workflows: found.workflows.map((row) => {
      const on = row.company ?? row.person;
      return {
        id: row.id,
        label: row.name,
        hint: on ? `On ${on}` : "Workflow",
        href: `/workflows/${row.id}`,
      };
    }),
    brainstorms: found.brainstorms.map((row) => ({
      id: row.id,
      label: row.name,
      hint: "Brainstorm board",
      href: `/brainstorm/${row.id}`,
    })),
    activities: found.activities.map((row) => ({
      id: row.id,
      label: row.title,
      hint: `${labelFor(row.kind)} · ${formatDateTime(row.occurredAt, timezone)}`,
      href: `/activities/${row.id}`,
    })),
    tasks: found.tasks.map((row) => ({
      id: row.id,
      label: row.title,
      hint:
        row.status === "done"
          ? "Done"
          : row.dueOn
            ? `Due ${formatDate(row.dueOn)}`
            : "No due date",
      href: `/tasks/${row.id}`,
    })),
  };
}
