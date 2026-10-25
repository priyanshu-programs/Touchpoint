import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  activities,
  contactOrganizations,
  enrichmentRuns,
  fieldProvenance,
  materialSends,
  organizationLogos,
  organizations,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { sideFor } from "@/modules/contacts/merge-fields";
import { MAX_MERGED_TAGS } from "@/modules/contacts/merge";
import { organizationTagNames } from "@/modules/tags/queries";
import { setOrganizationTags } from "@/modules/tags/service";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { MERGE_FIELDS, fieldValue } from "./merge-fields";
import type { OrganizationMerge } from "./schema";
import { lockOrganization, snapshot } from "./service";

export type OrganizationMergeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "reading" }
  | { ok: false; reason: "tags" | "boards"; count: number };

async function hasLogo(tx: Tx, organizationId: string) {
  const [row] = await tx
    .select({ id: organizationLogos.organizationId })
    .from(organizationLogos)
    .where(eq(organizationLogos.organizationId, organizationId));
  return Boolean(row);
}

// Keeps one company and moves everything the other had onto it, then deletes the other.
export async function mergeOrganizations(
  ownerId: string,
  { keep: keepId, other: otherId, picks, custom: customPicks }: OrganizationMerge,
): Promise<OrganizationMergeResult> {
  return db.transaction(async (tx) => {
    // Both are locked in one order, so two merges of the same pair cannot deadlock.
    const locked = [];
    for (const id of [keepId, otherId].sort()) {
      locked.push(await lockOrganization(tx, ownerId, id));
    }
    const keep = locked.find((row) => row?.id === keepId);
    const other = locked.find((row) => row?.id === otherId);
    if (!keep || !other) return { ok: false, reason: "not_found" };

    // A read that finishes later would write to a company that has changed or is gone.
    const [{ reading }] = await tx
      .select({ reading: count() })
      .from(enrichmentRuns)
      .where(
        and(
          eq(enrichmentRuns.ownerId, ownerId),
          inArray(enrichmentRuns.organizationId, [keep.id, other.id]),
          inArray(enrichmentRuns.status, ["queued", "running"]),
        ),
      );
    if (reading > 0) return { ok: false, reason: "reading" };

    const keepTags = await organizationTagNames(tx, ownerId, keep.id);
    const otherTags = await organizationTagNames(tx, ownerId, other.id);
    const seen = new Set(keepTags.map((name) => name.toLowerCase()));
    const tags = [
      ...keepTags,
      ...otherTags.filter((name) => !seen.has(name.toLowerCase())),
    ];
    if (tags.length > MAX_MERGED_TAGS) {
      return { ok: false, reason: "tags", count: tags.length };
    }
    const [{ boards }] = await tx
      .select({ boards: count() })
      .from(workflowBoards)
      .where(
        and(
          eq(workflowBoards.ownerId, ownerId),
          inArray(workflowBoards.organizationId, [keep.id, other.id]),
        ),
      );
    if (boards > MAX_RECORD_BOARDS) {
      return { ok: false, reason: "boards", count: boards };
    }

    const fields: Partial<typeof organizations.$inferInsert> = {};
    const provenanceOf = (id: string) =>
      and(
        eq(fieldProvenance.ownerId, ownerId),
        eq(fieldProvenance.entityType, "organization"),
        eq(fieldProvenance.entityId, id),
      );
    let websiteSide: "keep" | "other" = "keep";
    for (const field of MERGE_FIELDS) {
      const side = sideFor(
        !fieldValue(field, keep),
        !fieldValue(field, other),
        picks[field.key],
      );
      if (field.key === "website") websiteSide = side;
      if (side === "keep") continue;
      Object.assign(
        fields,
        Object.fromEntries(field.columns.map((column) => [column, other[column]])),
      );
      // Where a value came from, typed or read from the site, goes with the value.
      const columns: string[] = [...field.columns];
      await tx
        .delete(fieldProvenance)
        .where(and(provenanceOf(keep.id), inArray(fieldProvenance.field, columns)));
      await tx
        .update(fieldProvenance)
        .set({ entityId: keep.id })
        .where(and(provenanceOf(other.id), inArray(fieldProvenance.field, columns)));
    }
    await tx.delete(fieldProvenance).where(provenanceOf(other.id));

    // A value only the other has comes over; where both have one, the pick decides.
    const custom = { ...other.custom, ...keep.custom };
    for (const [key, side] of Object.entries(customPicks)) {
      if (side === "other" && key in keep.custom && key in other.custom) {
        custom[key] = other.custom[key];
      }
    }
    // Freed first: one company per domain, even for a moment.
    if (websiteSide === "other" && other.domain) {
      await tx
        .update(organizations)
        .set({ domain: null })
        .where(eq(organizations.id, other.id));
    }
    const [row] = await tx
      .update(organizations)
      .set({
        ...fields,
        custom,
        // Still hidden away only if both were.
        archivedAt: keep.archivedAt && other.archivedAt ? keep.archivedAt : null,
      })
      .where(eq(organizations.id, keep.id))
      .returning();

    const logoSide = sideFor(
      !(await hasLogo(tx, keep.id)),
      !(await hasLogo(tx, other.id)),
      picks.logo,
    );
    if (logoSide === "other") {
      await tx
        .delete(organizationLogos)
        .where(eq(organizationLogos.organizationId, keep.id));
      await tx
        .update(organizationLogos)
        .set({ organizationId: keep.id })
        .where(eq(organizationLogos.organizationId, other.id));
    }

    // The reads, and the people they found, are of the website that is kept.
    if (websiteSide === "other") {
      await tx
        .delete(enrichmentRuns)
        .where(eq(enrichmentRuns.organizationId, keep.id));
      await tx
        .update(enrichmentRuns)
        .set({ organizationId: keep.id })
        .where(eq(enrichmentRuns.organizationId, other.id));
    }

    await setOrganizationTags(tx, ownerId, keep.id, tags);

    // Someone at both keeps their place at the kept one, which takes what it lacks.
    await tx.execute(sql`
      update contact_organizations kept
      set job_title = coalesce(kept.job_title, merged.job_title),
          listed_as = coalesce(kept.listed_as, merged.listed_as)
      from contact_organizations merged
      where kept.organization_id = ${keep.id}
        and merged.organization_id = ${other.id}
        and merged.contact_id = kept.contact_id
    `);
    const [mergedStar] = await tx
      .select({ contactId: contactOrganizations.contactId })
      .from(contactOrganizations)
      .where(
        and(
          eq(contactOrganizations.organizationId, other.id),
          eq(contactOrganizations.isPrimary, true),
        ),
      );
    const [keptStar] = await tx
      .select({ contactId: contactOrganizations.contactId })
      .from(contactOrganizations)
      .where(
        and(
          eq(contactOrganizations.organizationId, keep.id),
          eq(contactOrganizations.isPrimary, true),
        ),
      );
    await tx.execute(sql`
      delete from contact_organizations merged
      using contact_organizations kept
      where merged.organization_id = ${other.id}
        and kept.organization_id = ${keep.id}
        and kept.contact_id = merged.contact_id
    `);
    // One person to reach first at a company: the kept one's, else the other's.
    await tx
      .update(contactOrganizations)
      .set({ isPrimary: false })
      .where(eq(contactOrganizations.organizationId, other.id));
    await tx
      .update(contactOrganizations)
      .set({ organizationId: keep.id })
      .where(eq(contactOrganizations.organizationId, other.id));
    if (mergedStar && !keptStar) {
      await tx
        .update(contactOrganizations)
        .set({ isPrimary: true })
        .where(
          and(
            eq(contactOrganizations.organizationId, keep.id),
            eq(contactOrganizations.contactId, mergedStar.contactId),
          ),
        );
    }

    await tx
      .update(activities)
      .set({ organizationId: keep.id })
      .where(and(eq(activities.ownerId, ownerId), eq(activities.organizationId, other.id)));
    await tx
      .update(materialSends)
      .set({ organizationId: keep.id })
      .where(
        and(eq(materialSends.ownerId, ownerId), eq(materialSends.organizationId, other.id)),
      );
    await tx
      .update(tasks)
      .set({ organizationId: keep.id })
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.organizationId, other.id)));
    const [keptBoardStar] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(
        and(
          eq(workflowBoards.organizationId, keep.id),
          eq(workflowBoards.starred, true),
        ),
      );
    if (keptBoardStar) {
      await tx
        .update(workflowBoards)
        .set({ starred: false })
        .where(eq(workflowBoards.organizationId, other.id));
    }
    await tx
      .update(workflowBoards)
      .set({ organizationId: keep.id })
      .where(eq(workflowBoards.organizationId, other.id));

    await tx.delete(organizations).where(eq(organizations.id, other.id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "organization.merge",
      entityType: "organization",
      entityId: keep.id,
      before: {
        kept: snapshot(keep, keepTags),
        merged: { id: other.id, ...snapshot(other, otherTags) },
      },
      after: snapshot(row, tags),
    });
    return { ok: true };
  });
}
