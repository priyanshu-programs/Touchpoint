import { and, eq, ne } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  fieldProvenance,
  organizations,
  type CustomValues,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { markManual, requestEnrichment } from "@/modules/enrichment/service";
import { ENRICHABLE_FIELDS } from "@/modules/enrichment/website/read";
import { dropUnusedFiles } from "@/modules/files/service";
import { statusOnOffer } from "@/modules/statuses/service";
import { organizationTagNames } from "@/modules/tags/queries";
import { setOrganizationTags } from "@/modules/tags/service";
import { findSimilarOrganizations } from "./queries";
import type { OrganizationInput } from "./schema";

type Named = { id: string; name: string };
export type OrganizationResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate"; existing: Named }
  | { ok: false; reason: "similar"; candidates: Named[] }
  | { ok: false; reason: "unknown_status" }
  | { ok: false; reason: "not_found" };

const snapshot = (row: typeof organizations.$inferSelect, tags: string[]) => ({
  name: row.name,
  domain: row.domain,
  website: row.website,
  phone: row.phone,
  email: row.email,
  industry: row.industry,
  description: row.description,
  city: row.city,
  region: row.region,
  country: row.country,
  status: row.status,
  custom: row.custom,
  tags,
});

async function domainOwner(
  tx: Tx,
  ownerId: string,
  domain: string,
  exceptId?: string,
) {
  const [row] = await tx
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.ownerId, ownerId),
        eq(organizations.domain, domain),
        exceptId ? ne(organizations.id, exceptId) : undefined,
      ),
    );
  return row;
}

export async function createOrganization(
  ownerId: string,
  input: OrganizationInput,
  options: { confirmSimilar?: boolean } = {},
): Promise<OrganizationResult> {
  return db.transaction(async (tx) => {
    if (!(await statusOnOffer(tx, ownerId, input.status))) {
      return { ok: false, reason: "unknown_status" };
    }
    if (input.domain) {
      const existing = await domainOwner(tx, ownerId, input.domain);
      if (existing) return { ok: false, reason: "duplicate", existing };
    }
    if (!options.confirmSimilar) {
      const candidates = await findSimilarOrganizations(tx, ownerId, input.name);
      if (candidates.length > 0) {
        return { ok: false, reason: "similar", candidates };
      }
    }

    const { tags, ...fields } = input;
    const [row] = await tx
      .insert(organizations)
      .values({ ownerId, ...fields })
      .returning();
    await setOrganizationTags(tx, ownerId, row.id, tags);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "organization.create",
      entityType: "organization",
      entityId: row.id,
      after: snapshot(row, tags),
    });
    // A refusal (the hourly limit) only means the details are not read now; the company is still saved.
    if (row.domain || row.website) await requestEnrichment(ownerId, row.id, tx);
    return { ok: true, id: row.id };
  });
}

// `custom` holds the values of the owner's own fields, already checked against
// them; left out, the ones the company has are kept.
export async function updateOrganization(
  ownerId: string,
  id: string,
  input: OrganizationInput,
  custom?: CustomValues,
): Promise<OrganizationResult> {
  return db.transaction(async (tx) => {
    // The status is locked before the company, the order a status's delete takes them in.
    const known = await statusOnOffer(tx, ownerId, input.status);
    const [before] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)))
      .for("update");
    if (!before) return { ok: false, reason: "not_found" };
    if (!known) return { ok: false, reason: "unknown_status" };

    if (input.domain) {
      const existing = await domainOwner(tx, ownerId, input.domain, id);
      if (existing) return { ok: false, reason: "duplicate", existing };
    }

    const beforeTags = await organizationTagNames(tx, ownerId, id);
    const { tags, ...fields } = input;
    const [row] = await tx
      .update(organizations)
      .set({ ...fields, ...(custom && { custom }) })
      .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)))
      .returning();
    await setOrganizationTags(tx, ownerId, id, tags);
    await markManual(
      tx,
      ownerId,
      id,
      ENRICHABLE_FIELDS.filter((field) => before[field] !== row[field]),
    );
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "organization.update",
      entityType: "organization",
      entityId: id,
      before: snapshot(before, beforeTags),
      after: snapshot(row, tags),
    });
    return { ok: true, id };
  });
}

// Contacts, tasks and activities outlive the company. A contact's place at it goes by
// foreign key, star included; tasks and activities have their link set to null.
export async function deleteOrganization(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const owned = and(
      eq(organizations.ownerId, ownerId),
      eq(organizations.id, id),
    );
    const [before] = await tx
      .select()
      .from(organizations)
      .where(owned)
      .for("update");
    if (!before) return false;

    const tags = await organizationTagNames(tx, ownerId, id);
    // Provenance points at any kind of record, so no foreign key clears it.
    await tx
      .delete(fieldProvenance)
      .where(
        and(
          eq(fieldProvenance.ownerId, ownerId),
          eq(fieldProvenance.entityType, "organization"),
          eq(fieldProvenance.entityId, id),
        ),
      );
    await tx.delete(organizations).where(owned);
    // Its workflow boards went with it, and with them what their boxes carried.
    await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "organization.delete",
      entityType: "organization",
      entityId: id,
      before: snapshot(before, tags),
    });
    return true;
  });
}

// False for a company that is not the owner's, and for a status they do not have.
export async function setOrganizationStatus(
  ownerId: string,
  id: string,
  status: OrganizationInput["status"],
) {
  return db.transaction(async (tx) => {
    const owned = and(
      eq(organizations.ownerId, ownerId),
      eq(organizations.id, id),
    );
    const known = await statusOnOffer(tx, ownerId, status);
    const [before] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(owned)
      .for("update");
    if (!before || !known) return false;
    await tx.update(organizations).set({ status }).where(owned);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "organization.set_status",
      entityType: "organization",
      entityId: id,
      before,
      after: { status },
    });
    return true;
  });
}

export async function setOrganizationArchived(
  ownerId: string,
  id: string,
  archived: boolean,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(organizations)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)))
      .returning({ id: organizations.id });
    if (!row) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: archived ? "organization.archive" : "organization.restore",
      entityType: "organization",
      entityId: id,
    });
    return true;
  });
}
