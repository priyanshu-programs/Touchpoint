import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  archivedAt,
  citext,
  createdAt,
  id,
  oneOf,
  ownerId,
  tsvector,
  updatedAt,
} from "./columns";

export const ORGANIZATION_STATUSES = [
  "prospect",
  "client",
  "past_client",
  "partner",
  "other",
] as const;
export const CONTACT_STATUSES = ["active", "dormant", "do_not_contact"] as const;
export const RELATIONSHIP_TYPES = [
  "prospect",
  "client",
  "partner",
  "referrer",
  "vendor",
  "other",
] as const;
export const PREFERRED_CHANNELS = [
  "email",
  "phone",
  "linkedin",
  "whatsapp",
  "other",
] as const;
export const LINK_KINDS = ["linkedin", "x", "website", "other"] as const;

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    industry: text("industry"),
    description: text("description"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    status: text("status").notNull().default("prospect"),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', ${organizations.name} || ' ' || coalesce(${organizations.domain}, '') || ' ' || coalesce(${organizations.industry}, '') || ' ' || coalesce(${organizations.city}, ''))`,
    ),
    archivedAt,
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "organizations_status_check",
      oneOf(table.status, ORGANIZATION_STATUSES),
    ),
    uniqueIndex("organizations_owner_domain_idx")
      .on(table.ownerId, table.domain)
      .where(sql`${table.domain} is not null`),
    index("organizations_owner_name_idx").on(
      table.ownerId,
      sql`lower(${table.name})`,
      table.id,
    ),
    index("organizations_search_idx").using("gin", table.search),
    index("organizations_name_trgm_idx").using(
      "gin",
      table.name.op("gin_trgm_ops"),
    ),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    ownerId: ownerId(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    fullName: text("full_name")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`btrim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, ''))`,
      ),
    jobTitle: text("job_title"),
    department: text("department"),
    phoneE164: text("phone_e164"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    timezone: text("timezone"),
    preferredChannel: text("preferred_channel"),
    status: text("status").notNull().default("active"),
    relationshipType: text("relationship_type").notNull().default("prospect"),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', ${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '') || ' ' || coalesce(${contacts.jobTitle}, '') || ' ' || coalesce(${contacts.department}, ''))`,
    ),
    archivedAt,
    createdAt,
    updatedAt,
  },
  (table) => [
    check("contacts_status_check", oneOf(table.status, CONTACT_STATUSES)),
    check(
      "contacts_relationship_type_check",
      oneOf(table.relationshipType, RELATIONSHIP_TYPES),
    ),
    check(
      "contacts_preferred_channel_check",
      oneOf(table.preferredChannel, PREFERRED_CHANNELS),
    ),
    index("contacts_owner_name_idx").on(
      table.ownerId,
      sql`lower(${table.fullName})`,
      table.id,
    ),
    index("contacts_organization_idx").on(table.organizationId),
    index("contacts_search_idx").using("gin", table.search),
    index("contacts_name_trgm_idx").using(
      "gin",
      table.fullName.op("gin_trgm_ops"),
    ),
  ],
);

export const contactEmails = pgTable(
  "contact_emails",
  {
    id: id(),
    ownerId: ownerId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt,
  },
  (table) => [
    uniqueIndex("contact_emails_owner_email_idx").on(table.ownerId, table.email),
    uniqueIndex("contact_emails_primary_idx")
      .on(table.contactId)
      .where(sql`${table.isPrimary}`),
    index("contact_emails_contact_idx").on(table.contactId),
  ],
);

export const contactLinks = pgTable(
  "contact_links",
  {
    id: id(),
    ownerId: ownerId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    createdAt,
  },
  (table) => [
    check("contact_links_kind_check", oneOf(table.kind, LINK_KINDS)),
    index("contact_links_contact_idx").on(table.contactId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    ownerId: ownerId(),
    name: citext("name").notNull(),
    createdAt,
  },
  (table) => [uniqueIndex("tags_owner_name_idx").on(table.ownerId, table.name)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.tagId] }),
    index("contact_tags_tag_idx").on(table.tagId),
  ],
);

export const organizationTags = pgTable(
  "organization_tags",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.tagId] }),
    index("organization_tags_tag_idx").on(table.tagId),
  ],
);
