import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contactEmails,
  contactLinks,
  contacts,
  fieldProvenance,
  organizations,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { contactTagNames } from "@/modules/tags/queries";
import { setContactTags } from "@/modules/tags/service";
import { findSimilarContacts } from "./queries";
import type {
  ContactEmailInput,
  ContactInput,
  ContactLinkInput,
  NewContactInput,
} from "./schema";

type Named = { id: string; name: string };
export type ContactResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate"; existing: Named }
  | { ok: false; reason: "similar"; candidates: Named[] }
  | { ok: false; reason: "unknown_organization" }
  | { ok: false; reason: "not_found" };
export type ContactEmailResult =
  | { ok: true }
  | { ok: false; reason: "duplicate"; existing: Named }
  | { ok: false; reason: "not_found" };

const snapshot = (row: typeof contacts.$inferSelect, tags: string[]) => ({
  firstName: row.firstName,
  lastName: row.lastName,
  organizationId: row.organizationId,
  jobTitle: row.jobTitle,
  department: row.department,
  phoneE164: row.phoneE164,
  city: row.city,
  region: row.region,
  country: row.country,
  timezone: row.timezone,
  preferredChannel: row.preferredChannel,
  status: row.status,
  relationshipType: row.relationshipType,
  isPrimary: row.isPrimary,
  tags,
});

async function ownsOrganization(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)));
  return Boolean(row);
}

async function emailHolder(tx: Tx, ownerId: string, email: string) {
  const [row] = await tx
    .select({ id: contacts.id, name: contacts.fullName })
    .from(contactEmails)
    .innerJoin(contacts, eq(contacts.id, contactEmails.contactId))
    .where(
      and(eq(contactEmails.ownerId, ownerId), eq(contactEmails.email, email)),
    );
  return row;
}

async function lockContact(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)))
    .for("update");
  return row;
}

export async function createContact(
  ownerId: string,
  input: NewContactInput,
  options: { confirmSimilar?: boolean } = {},
): Promise<ContactResult> {
  return db.transaction(async (tx) => {
    const { email, tags, ...fields } = input;
    if (
      fields.organizationId &&
      !(await ownsOrganization(tx, ownerId, fields.organizationId))
    ) {
      return { ok: false, reason: "unknown_organization" };
    }
    if (email) {
      const existing = await emailHolder(tx, ownerId, email);
      if (existing) return { ok: false, reason: "duplicate", existing };
    }
    if (!options.confirmSimilar) {
      const name = [fields.firstName, fields.lastName].filter(Boolean).join(" ");
      const candidates = await findSimilarContacts(
        tx,
        ownerId,
        name,
        fields.organizationId,
      );
      if (candidates.length > 0) {
        return { ok: false, reason: "similar", candidates };
      }
    }

    // The first person added at a company is the one to reach until the owner says otherwise.
    const [colleague] = fields.organizationId
      ? await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.ownerId, ownerId),
              eq(contacts.organizationId, fields.organizationId),
              isNull(contacts.archivedAt),
            ),
          )
          .limit(1)
      : [];
    const [row] = await tx
      .insert(contacts)
      .values({
        ownerId,
        ...fields,
        isPrimary: Boolean(fields.organizationId) && !colleague,
      })
      .returning();
    if (email) {
      await tx
        .insert(contactEmails)
        .values({ ownerId, contactId: row.id, email, isPrimary: true });
    }
    await setContactTags(tx, ownerId, row.id, tags);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.create",
      entityType: "contact",
      entityId: row.id,
      after: { ...snapshot(row, tags), email },
    });
    return { ok: true, id: row.id };
  });
}

export async function updateContact(
  ownerId: string,
  id: string,
  input: ContactInput,
): Promise<ContactResult> {
  return db.transaction(async (tx) => {
    const before = await lockContact(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (
      input.organizationId &&
      !(await ownsOrganization(tx, ownerId, input.organizationId))
    ) {
      return { ok: false, reason: "unknown_organization" };
    }

    const beforeTags = await contactTagNames(tx, ownerId, id);
    const { tags, ...fields } = input;
    const [row] = await tx
      .update(contacts)
      .set({
        ...fields,
        // Being the primary contact belongs to the company that was left.
        ...(fields.organizationId !== before.organizationId && {
          isPrimary: false,
        }),
      })
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)))
      .returning();
    await setContactTags(tx, ownerId, id, tags);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.update",
      entityType: "contact",
      entityId: id,
      before: snapshot(before, beforeTags),
      after: snapshot(row, tags),
    });
    return { ok: true, id };
  });
}

export async function setContactArchived(
  ownerId: string,
  id: string,
  archived: boolean,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(contacts)
      .set({
        archivedAt: archived ? new Date() : null,
        ...(archived && { isPrimary: false }),
      })
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)))
      .returning({ id: contacts.id });
    if (!row) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: archived ? "contact.archive" : "contact.restore",
      entityType: "contact",
      entityId: id,
    });
    return true;
  });
}

// Emails, links, tags and the person's place on logged activities go with them:
// their foreign keys cascade. Tasks outlive the person, with the link set to null.
export async function deleteContact(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockContact(tx, ownerId, id);
    if (!before) return null;

    const tags = await contactTagNames(tx, ownerId, id);
    // Provenance points at any kind of record, so no foreign key clears it.
    await tx
      .delete(fieldProvenance)
      .where(
        and(
          eq(fieldProvenance.ownerId, ownerId),
          eq(fieldProvenance.entityType, "contact"),
          eq(fieldProvenance.entityId, id),
        ),
      );
    await tx
      .delete(contacts)
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.delete",
      entityType: "contact",
      entityId: id,
      before: snapshot(before, tags),
    });
    return { organizationId: before.organizationId };
  });
}

export async function setContactRelationship(
  ownerId: string,
  id: string,
  relationshipType: ContactInput["relationshipType"],
) {
  return db.transaction(async (tx) => {
    const before = await lockContact(tx, ownerId, id);
    if (!before) return false;
    await tx
      .update(contacts)
      .set({ relationshipType })
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.set_relationship",
      entityType: "contact",
      entityId: id,
      before: { relationshipType: before.relationshipType },
      after: { relationshipType },
    });
    return true;
  });
}

// Marks or unmarks a company's primary contact; a company has at most one.
export async function setPrimaryContact(
  ownerId: string,
  id: string,
  primary: boolean,
) {
  return db.transaction(async (tx) => {
    const contact = await lockContact(tx, ownerId, id);
    if (!contact?.organizationId || contact.archivedAt) return false;

    // Clear first: the one-primary-per-company index rejects two even briefly.
    await tx
      .update(contacts)
      .set({ isPrimary: false })
      .where(
        and(
          eq(contacts.ownerId, ownerId),
          eq(contacts.organizationId, contact.organizationId),
          eq(contacts.isPrimary, true),
        ),
      );
    if (primary) {
      await tx
        .update(contacts)
        .set({ isPrimary: true })
        .where(eq(contacts.id, id));
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.set_primary",
      entityType: "contact",
      entityId: id,
      before: { isPrimary: contact.isPrimary },
      after: { isPrimary: primary, organizationId: contact.organizationId },
    });
    return true;
  });
}

export async function addContactEmail(
  ownerId: string,
  contactId: string,
  input: ContactEmailInput,
): Promise<ContactEmailResult> {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) {
      return { ok: false, reason: "not_found" };
    }
    const existing = await emailHolder(tx, ownerId, input.email);
    if (existing) return { ok: false, reason: "duplicate", existing };

    const [primary] = await tx
      .select({ id: contactEmails.id })
      .from(contactEmails)
      .where(
        and(
          eq(contactEmails.contactId, contactId),
          eq(contactEmails.isPrimary, true),
        ),
      );
    await tx
      .insert(contactEmails)
      .values({ ownerId, contactId, ...input, isPrimary: !primary });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.email_add",
      entityType: "contact",
      entityId: contactId,
      after: input,
    });
    return { ok: true };
  });
}

export async function removeContactEmail(
  ownerId: string,
  contactId: string,
  emailId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) return false;
    const [removed] = await tx
      .delete(contactEmails)
      .where(
        and(
          eq(contactEmails.ownerId, ownerId),
          eq(contactEmails.contactId, contactId),
          eq(contactEmails.id, emailId),
        ),
      )
      .returning();
    if (!removed) return false;

    if (removed.isPrimary) {
      const [next] = await tx
        .select({ id: contactEmails.id })
        .from(contactEmails)
        .where(eq(contactEmails.contactId, contactId))
        .orderBy(asc(contactEmails.createdAt))
        .limit(1);
      if (next) {
        await tx
          .update(contactEmails)
          .set({ isPrimary: true })
          .where(eq(contactEmails.id, next.id));
      }
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.email_remove",
      entityType: "contact",
      entityId: contactId,
      before: { email: removed.email, label: removed.label },
    });
    return true;
  });
}

export async function setPrimaryEmail(
  ownerId: string,
  contactId: string,
  emailId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) return false;
    const [target] = await tx
      .select({ email: contactEmails.email })
      .from(contactEmails)
      .where(
        and(
          eq(contactEmails.ownerId, ownerId),
          eq(contactEmails.contactId, contactId),
          eq(contactEmails.id, emailId),
        ),
      );
    if (!target) return false;

    // Clear first: the one-primary-per-contact index rejects two primaries even briefly.
    await tx
      .update(contactEmails)
      .set({ isPrimary: false })
      .where(eq(contactEmails.contactId, contactId));
    await tx
      .update(contactEmails)
      .set({ isPrimary: true })
      .where(eq(contactEmails.id, emailId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.email_primary",
      entityType: "contact",
      entityId: contactId,
      after: { email: target.email },
    });
    return true;
  });
}

export async function addContactLink(
  ownerId: string,
  contactId: string,
  input: ContactLinkInput,
) {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) return false;
    await tx.insert(contactLinks).values({ ownerId, contactId, ...input });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.link_add",
      entityType: "contact",
      entityId: contactId,
      after: input,
    });
    return true;
  });
}

export async function removeContactLink(
  ownerId: string,
  contactId: string,
  linkId: string,
) {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(contactLinks)
      .where(
        and(
          eq(contactLinks.ownerId, ownerId),
          eq(contactLinks.contactId, contactId),
          eq(contactLinks.id, linkId),
        ),
      )
      .returning();
    if (!removed) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.link_remove",
      entityType: "contact",
      entityId: contactId,
      before: { kind: removed.kind, url: removed.url },
    });
    return true;
  });
}
