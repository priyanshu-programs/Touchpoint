import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  activityContacts,
  contactEmails,
  contactLinks,
  contactOrganizations,
  contactPhotos,
  contacts,
  fieldProvenance,
  invoices,
  payments,
  materialSendRecipients,
  profileSearches,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { contactTagNames } from "@/modules/tags/queries";
import { setContactTags } from "@/modules/tags/service";
import { MAX_RECORD_BOARDS } from "@/modules/workflows/schema";
import { MERGE_FIELDS, fieldValue, sideFor } from "./merge-fields";
import type { ContactMerge } from "./schema";
import { lockContact, snapshot } from "./service";

export const MAX_MERGED_TAGS = 20;

export type MergeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "tags" | "boards"; count: number };

async function hasPhoto(tx: Tx, contactId: string) {
  const [row] = await tx
    .select({ id: contactPhotos.contactId })
    .from(contactPhotos)
    .where(eq(contactPhotos.contactId, contactId));
  return Boolean(row);
}

async function hasPrimaryEmail(tx: Tx, contactId: string) {
  const [row] = await tx
    .select({ id: contactEmails.id })
    .from(contactEmails)
    .where(
      and(eq(contactEmails.contactId, contactId), eq(contactEmails.isPrimary, true)),
    );
  return Boolean(row);
}

// Keeps one person and moves everything the other had onto them, then deletes the other.
export async function mergeContacts(
  ownerId: string,
  { keep: keepId, other: otherId, picks, custom: customPicks }: ContactMerge,
): Promise<MergeResult> {
  return db.transaction(async (tx) => {
    // Both are locked in one order, so two merges of the same pair cannot deadlock.
    const locked = [];
    for (const id of [keepId, otherId].sort()) {
      locked.push(await lockContact(tx, ownerId, id));
    }
    const keep = locked.find((row) => row?.id === keepId);
    const other = locked.find((row) => row?.id === otherId);
    if (!keep || !other) return { ok: false, reason: "not_found" };

    const keepTags = await contactTagNames(tx, ownerId, keep.id);
    const otherTags = await contactTagNames(tx, ownerId, other.id);
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
          inArray(workflowBoards.contactId, [keep.id, other.id]),
        ),
      );
    if (boards > MAX_RECORD_BOARDS) {
      return { ok: false, reason: "boards", count: boards };
    }

    const fields: Partial<typeof contacts.$inferInsert> = {};
    for (const field of MERGE_FIELDS) {
      const side = sideFor(
        !fieldValue(field, keep),
        !fieldValue(field, other),
        picks[field.key],
      );
      if (side === "other") {
        Object.assign(
          fields,
          Object.fromEntries(field.columns.map((column) => [column, other[column]])),
        );
      }
    }
    // A value only the other has comes over; where both have one, the pick decides.
    const custom = { ...other.custom, ...keep.custom };
    for (const [key, side] of Object.entries(customPicks)) {
      if (side === "other" && key in keep.custom && key in other.custom) {
        custom[key] = other.custom[key];
      }
    }
    const [row] = await tx
      .update(contacts)
      .set({
        ...fields,
        custom,
        // Still hidden away only if both were.
        archivedAt: keep.archivedAt && other.archivedAt ? keep.archivedAt : null,
      })
      .where(eq(contacts.id, keep.id))
      .returning();

    const photoSide = sideFor(
      !(await hasPhoto(tx, keep.id)),
      !(await hasPhoto(tx, other.id)),
      picks.photo,
    );
    if (photoSide === "other") {
      await tx.delete(contactPhotos).where(eq(contactPhotos.contactId, keep.id));
      await tx
        .update(contactPhotos)
        .set({ contactId: keep.id })
        .where(eq(contactPhotos.contactId, other.id));
    }
    // A person's provenance is about their photo: it goes with the photo that is kept.
    const provenanceOf = (id: string) =>
      and(
        eq(fieldProvenance.ownerId, ownerId),
        eq(fieldProvenance.entityType, "contact"),
        eq(fieldProvenance.entityId, id),
      );
    if (photoSide === "other") {
      await tx
        .delete(fieldProvenance)
        .where(and(provenanceOf(keep.id), eq(fieldProvenance.field, "photo")));
      await tx
        .update(fieldProvenance)
        .set({ entityId: keep.id })
        .where(and(provenanceOf(other.id), eq(fieldProvenance.field, "photo")));
    }
    await tx.delete(fieldProvenance).where(provenanceOf(other.id));

    // Clear first: the one-primary-per-person index rejects two primaries even briefly.
    const emailSide = sideFor(
      !(await hasPrimaryEmail(tx, keep.id)),
      !(await hasPrimaryEmail(tx, other.id)),
      picks.primaryEmail,
    );
    await tx
      .update(contactEmails)
      .set({ isPrimary: false })
      .where(eq(contactEmails.contactId, emailSide === "other" ? keep.id : other.id));
    await tx
      .update(contactEmails)
      .set({ contactId: keep.id })
      .where(eq(contactEmails.contactId, other.id));

    await tx
      .delete(contactLinks)
      .where(
        and(
          eq(contactLinks.contactId, other.id),
          sql`exists (
            select 1 from contact_links kept
            where kept.contact_id = ${keep.id}
              and kept.kind = ${contactLinks.kind}
              and kept.url = ${contactLinks.url}
          )`,
        ),
      );
    await tx
      .update(contactLinks)
      .set({ contactId: keep.id })
      .where(eq(contactLinks.contactId, other.id));

    await setContactTags(tx, ownerId, keep.id, tags);

    // At a company both are at, the kept row stays and takes what it lacks from the other.
    await tx.execute(sql`
      update contact_organizations kept
      set job_title = coalesce(kept.job_title, merged.job_title),
          listed_as = coalesce(kept.listed_as, merged.listed_as)
      from contact_organizations merged
      where kept.contact_id = ${keep.id}
        and merged.contact_id = ${other.id}
        and merged.organization_id = kept.organization_id
    `);
    const starred = await tx
      .select({ organizationId: contactOrganizations.organizationId })
      .from(contactOrganizations)
      .where(
        and(
          eq(contactOrganizations.contactId, other.id),
          eq(contactOrganizations.isPrimary, true),
        ),
      );
    await tx.execute(sql`
      delete from contact_organizations merged
      using contact_organizations kept
      where merged.contact_id = ${other.id}
        and kept.contact_id = ${keep.id}
        and kept.organization_id = merged.organization_id
    `);
    await tx
      .update(contactOrganizations)
      .set({ contactId: keep.id })
      .where(eq(contactOrganizations.contactId, other.id));
    if (starred.length > 0 && !row.archivedAt) {
      await tx
        .update(contactOrganizations)
        .set({ isPrimary: true })
        .where(
          and(
            eq(contactOrganizations.contactId, keep.id),
            inArray(
              contactOrganizations.organizationId,
              starred.map((star) => star.organizationId),
            ),
          ),
        );
    }

    // An activity or a send both were on keeps one place for the kept person.
    await tx.execute(sql`
      insert into activity_contacts (activity_id, contact_id, owner_id)
      select activity_id, ${keep.id}, owner_id from activity_contacts
      where contact_id = ${other.id}
      on conflict do nothing
    `);
    await tx
      .delete(activityContacts)
      .where(eq(activityContacts.contactId, other.id));
    await tx.execute(sql`
      insert into material_send_recipients (send_id, contact_id, owner_id)
      select send_id, ${keep.id}, owner_id from material_send_recipients
      where contact_id = ${other.id}
      on conflict do nothing
    `);
    await tx
      .delete(materialSendRecipients)
      .where(eq(materialSendRecipients.contactId, other.id));

    await tx
      .update(tasks)
      .set({ contactId: keep.id })
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.contactId, other.id)));
    await tx
      .update(invoices)
      .set({ contactId: keep.id })
      .where(and(eq(invoices.ownerId, ownerId), eq(invoices.contactId, other.id)));
    await tx
      .update(payments)
      .set({ contactId: keep.id })
      .where(and(eq(payments.ownerId, ownerId), eq(payments.contactId, other.id)));
    const [keptStar] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(
        and(eq(workflowBoards.contactId, keep.id), eq(workflowBoards.starred, true)),
      );
    if (keptStar) {
      await tx
        .update(workflowBoards)
        .set({ starred: false })
        .where(eq(workflowBoards.contactId, other.id));
    }
    await tx
      .update(workflowBoards)
      .set({ contactId: keep.id })
      .where(eq(workflowBoards.contactId, other.id));
    await tx
      .update(profileSearches)
      .set({ contactId: keep.id })
      .where(eq(profileSearches.contactId, other.id));

    await tx.delete(contacts).where(eq(contacts.id, other.id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.merge",
      entityType: "contact",
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
