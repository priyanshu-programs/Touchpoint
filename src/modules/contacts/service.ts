import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contactEmails,
  contactLinks,
  contactOrganizations,
  contacts,
  fieldProvenance,
  organizations,
  type CustomValues,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles } from "@/modules/files/service";
import { contactTagNames } from "@/modules/tags/queries";
import { setContactTags } from "@/modules/tags/service";
import { companies, findSimilarContacts } from "./queries";
import type {
  ContactEmailInput,
  ContactInput,
  ContactLinkInput,
  NewContactInput,
} from "./schema";

// Someone a new contact may already be, and where they are, so a form can offer them.
type Named = {
  id: string;
  name: string;
  companies: { id: string; name: string }[];
};
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
export type CompanyLinkResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "unknown_organization" | "already" };

export const snapshot = (row: typeof contacts.$inferSelect, tags: string[]) => ({
  firstName: row.firstName,
  lastName: row.lastName,
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
  custom: row.custom,
  tags,
});

const linkOf = (ownerId: string, contactId: string, organizationId: string) =>
  and(
    eq(contactOrganizations.ownerId, ownerId),
    eq(contactOrganizations.contactId, contactId),
    eq(contactOrganizations.organizationId, organizationId),
  );

// Puts a person at a company. The first active person there is the one to reach
// until the owner says otherwise.
async function insertLink(
  tx: Tx,
  ownerId: string,
  contact: { id: string; archivedAt: Date | null },
  organizationId: string,
  link: { jobTitle?: string | null; listedAs?: string | null } = {},
) {
  const [colleague] = await tx
    .select({ id: contacts.id })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .where(
      and(
        eq(contactOrganizations.ownerId, ownerId),
        eq(contactOrganizations.organizationId, organizationId),
        isNull(contacts.archivedAt),
      ),
    )
    .limit(1);
  await tx.insert(contactOrganizations).values({
    ownerId,
    contactId: contact.id,
    organizationId,
    jobTitle: link.jobTitle ?? null,
    listedAs: link.listedAs ?? null,
    isPrimary: !colleague && !contact.archivedAt,
  });
}

export async function ownsOrganization(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, id)));
  return Boolean(row);
}

export async function emailHolder(tx: Tx, ownerId: string, email: string) {
  const [row] = await tx
    .select({ id: contacts.id, name: contacts.fullName, companies })
    .from(contactEmails)
    .innerJoin(contacts, eq(contacts.id, contactEmails.contactId))
    .where(
      and(eq(contactEmails.ownerId, ownerId), eq(contactEmails.email, email)),
    );
  return row;
}

export async function lockContact(tx: Tx, ownerId: string, id: string) {
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
    const { email, organizationId, firstName, lastName } = input;
    if (
      organizationId &&
      !(await ownsOrganization(tx, ownerId, organizationId))
    ) {
      return { ok: false, reason: "unknown_organization" };
    }
    if (email) {
      const existing = await emailHolder(tx, ownerId, email);
      if (existing) return { ok: false, reason: "duplicate", existing };
    }
    if (!options.confirmSimilar) {
      const name = [firstName, lastName].filter(Boolean).join(" ");
      const candidates = await findSimilarContacts(
        tx,
        ownerId,
        name,
        organizationId,
      );
      if (candidates.length > 0) {
        return { ok: false, reason: "similar", candidates };
      }
    }
    return { ok: true, id: await insertContact(tx, ownerId, input) };
  });
}

// The caller has checked the company, the email and similar names.
export async function insertContact(
  tx: Tx,
  ownerId: string,
  input: NewContactInput,
) {
  const { email, tags, organizationId, ...fields } = input;
  const [row] = await tx
    .insert(contacts)
    .values({ ownerId, ...fields })
    .returning();
  if (organizationId) await insertLink(tx, ownerId, row, organizationId);
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
    after: { ...snapshot(row, tags), email, organizationId },
  });
  return row.id;
}

// Puts someone already known at another company too. `listedAs` is the name that
// company's website gives them, kept so the website stops offering them as new.
export async function addContactCompany(
  ownerId: string,
  contactId: string,
  organizationId: string,
  link: { jobTitle: string | null; listedAs?: string | null },
): Promise<CompanyLinkResult> {
  return db.transaction(async (tx) => {
    const contact = await lockContact(tx, ownerId, contactId);
    if (!contact) return { ok: false, reason: "not_found" };
    if (!(await ownsOrganization(tx, ownerId, organizationId))) {
      return { ok: false, reason: "unknown_organization" };
    }
    const [existing] = await tx
      .select({ jobTitle: contactOrganizations.jobTitle })
      .from(contactOrganizations)
      .where(linkOf(ownerId, contactId, organizationId));
    // Already there under their own name: only what the website calls them is new.
    if (existing && !link.listedAs) return { ok: false, reason: "already" };

    if (existing) {
      await tx
        .update(contactOrganizations)
        .set({
          listedAs: link.listedAs,
          jobTitle: existing.jobTitle ?? link.jobTitle,
        })
        .where(linkOf(ownerId, contactId, organizationId));
    } else {
      await insertLink(tx, ownerId, contact, organizationId, link);
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: existing ? "contact.match_company" : "contact.add_company",
      entityType: "contact",
      entityId: contactId,
      after: { organizationId, ...link },
    });
    return { ok: true };
  });
}

// The person stays, with their other companies; only their place at this one goes.
export async function removeContactCompany(
  ownerId: string,
  contactId: string,
  organizationId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) return false;
    const [removed] = await tx
      .delete(contactOrganizations)
      .where(linkOf(ownerId, contactId, organizationId))
      .returning();
    if (!removed) return false;
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.remove_company",
      entityType: "contact",
      entityId: contactId,
      before: {
        organizationId,
        jobTitle: removed.jobTitle,
        isPrimary: removed.isPrimary,
      },
    });
    return true;
  });
}

export async function setContactCompanyTitle(
  ownerId: string,
  contactId: string,
  organizationId: string,
  jobTitle: string | null,
) {
  return db.transaction(async (tx) => {
    if (!(await lockContact(tx, ownerId, contactId))) return false;
    const [before] = await tx
      .select({ jobTitle: contactOrganizations.jobTitle })
      .from(contactOrganizations)
      .where(linkOf(ownerId, contactId, organizationId));
    if (!before) return false;
    await tx
      .update(contactOrganizations)
      .set({ jobTitle })
      .where(linkOf(ownerId, contactId, organizationId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.set_company_title",
      entityType: "contact",
      entityId: contactId,
      before: { organizationId, jobTitle: before.jobTitle },
      after: { organizationId, jobTitle },
    });
    return true;
  });
}

// `custom` holds the values of the owner's own fields, already checked against
// them; left out, the ones the person has are kept.
export async function updateContact(
  ownerId: string,
  id: string,
  input: ContactInput,
  custom?: CustomValues,
): Promise<ContactResult> {
  return db.transaction(async (tx) => {
    const before = await lockContact(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };

    const beforeTags = await contactTagNames(tx, ownerId, id);
    const { tags, ...fields } = input;
    const [row] = await tx
      .update(contacts)
      .set({ ...fields, ...(custom && { custom }) })
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
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)))
      .returning({ id: contacts.id });
    if (!row) return false;
    if (archived) {
      // Nobody hidden away stays the person to reach first, at any company.
      await tx
        .update(contactOrganizations)
        .set({ isPrimary: false })
        .where(
          and(
            eq(contactOrganizations.ownerId, ownerId),
            eq(contactOrganizations.contactId, id),
          ),
        );
    }
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

// Emails, links, tags, their place at each company and on logged activities go with
// them: their foreign keys cascade. Tasks outlive the person, with the link set to null.
export async function deleteContact(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockContact(tx, ownerId, id);
    if (!before) return false;

    const tags = await contactTagNames(tx, ownerId, id);
    const companies = await tx
      .select({ id: contactOrganizations.organizationId })
      .from(contactOrganizations)
      .where(eq(contactOrganizations.contactId, id));
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
    // Their workflow boards went with them, and with them what the boxes carried.
    await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.delete",
      entityType: "contact",
      entityId: id,
      before: {
        ...snapshot(before, tags),
        organizationIds: companies.map((company) => company.id),
      },
    });
    return true;
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

// Marks or unmarks a company's primary contact; a company has at most one, and a
// person may be it at more than one company.
export async function setPrimaryContact(
  ownerId: string,
  id: string,
  organizationId: string,
  primary: boolean,
) {
  return db.transaction(async (tx) => {
    const contact = await lockContact(tx, ownerId, id);
    if (!contact || contact.archivedAt) return false;
    const [link] = await tx
      .select({ isPrimary: contactOrganizations.isPrimary })
      .from(contactOrganizations)
      .where(linkOf(ownerId, id, organizationId));
    if (!link) return false;

    // Clear first: the one-primary-per-company index rejects two even briefly.
    await tx
      .update(contactOrganizations)
      .set({ isPrimary: false })
      .where(
        and(
          eq(contactOrganizations.ownerId, ownerId),
          eq(contactOrganizations.organizationId, organizationId),
          eq(contactOrganizations.isPrimary, true),
        ),
      );
    if (primary) {
      await tx
        .update(contactOrganizations)
        .set({ isPrimary: true })
        .where(linkOf(ownerId, id, organizationId));
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "contact.set_primary",
      entityType: "contact",
      entityId: id,
      before: { isPrimary: link.isPrimary },
      after: { isPrimary: primary, organizationId },
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
