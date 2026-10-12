import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, createdAt, id, oneOf, ownerId } from "./columns";
import { contacts, organizations } from "./people";

export const ENRICHMENT_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;
export const PROVENANCE_SOURCES = ["manual", "website"] as const;
export const PROVENANCE_CONFIDENCES = ["verified", "inferred"] as const;

export const enrichmentRuns = pgTable(
  "enrichment_runs",
  {
    id: id(),
    ownerId: ownerId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("website"),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").$type<{ url: string }>().notNull(),
    // What was extracted, never the page itself.
    rawResult: jsonb("raw_result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    check(
      "enrichment_runs_status_check",
      oneOf(table.status, ENRICHMENT_STATUSES),
    ),
    index("enrichment_runs_organization_idx").on(
      table.ownerId,
      table.organizationId,
      table.createdAt.desc(),
    ),
  ],
);

export const fieldProvenance = pgTable(
  "field_provenance",
  {
    id: id(),
    ownerId: ownerId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    source: text("source").notNull(),
    confidence: text("confidence").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    runId: uuid("run_id").references(() => enrichmentRuns.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    check(
      "field_provenance_source_check",
      oneOf(table.source, PROVENANCE_SOURCES),
    ),
    check(
      "field_provenance_confidence_check",
      oneOf(table.confidence, PROVENANCE_CONFIDENCES),
    ),
    uniqueIndex("field_provenance_field_idx").on(
      table.ownerId,
      table.entityType,
      table.entityId,
      table.field,
    ),
  ],
);

export const PROFILE_KINDS = ["linkedin", "x", "github"] as const;
export const PROFILE_SEARCH_STATUSES = ["done", "failed"] as const;
export type ProfileCandidate = {
  kind: (typeof PROFILE_KINDS)[number];
  url: string;
  // How the search result is headed, which tells namesakes apart.
  title: string | null;
};

// One search by name for a person's profiles. Kept so the answer can be shown again
// without another search, and so searches can be counted against the free allowance.
export const profileSearches = pgTable(
  "profile_searches",
  {
    id: id(),
    ownerId: ownerId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    // What is still on offer, never the search service's answer itself.
    results: jsonb("results").$type<ProfileCandidate[]>().notNull(),
    createdAt,
  },
  (table) => [
    check(
      "profile_searches_status_check",
      oneOf(table.status, PROFILE_SEARCH_STATUSES),
    ),
    index("profile_searches_contact_idx").on(
      table.ownerId,
      table.contactId,
      table.createdAt.desc(),
    ),
  ],
);

// Apart from organizations, so listing companies never loads image bytes.
export const organizationLogos = pgTable("organization_logos", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  ownerId: ownerId(),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  sourceUrl: text("source_url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// A person's picture, found beside their name on their company's website.
export const contactPhotos = pgTable("contact_photos", {
  contactId: uuid("contact_id")
    .primaryKey()
    .references(() => contacts.id, { onDelete: "cascade" }),
  ownerId: ownerId(),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  sourceUrl: text("source_url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
