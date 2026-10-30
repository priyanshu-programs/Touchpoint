import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";
import { contacts, organizations } from "./people";

export const INTEGRATION_PROVIDERS = ["google"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const CONNECTION_STATUSES = [
  "connected",
  "expired",
  "revoked",
  "error",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

// The owner's own OAuth client, made in their own Google Cloud project. The secret is
// sealed with APP_ENCRYPTION_KEY and opened only to talk to Google.
export const integrationClients = pgTable(
  "integration_clients",
  {
    id: id(),
    ownerId: ownerId(),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    clientId: text("client_id").notNull(),
    clientSecretEnc: text("client_secret_enc").notNull(),
    keyVersion: integer("key_version").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "integration_clients_provider_check",
      oneOf(table.provider, INTEGRATION_PROVIDERS),
    ),
    uniqueIndex("integration_clients_owner_provider_idx").on(
      table.ownerId,
      table.provider,
    ),
  ],
);

// The access an account granted. Tokens are sealed like the client's secret and
// cleared on disconnect; the row stays to say what happened.
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    ownerId: ownerId(),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    accountEmail: text("account_email").notNull(),
    scopes: text("scopes").array().notNull(),
    status: text("status").$type<ConnectionStatus>().notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenEnc: text("access_token_enc"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    keyVersion: integer("key_version").notNull(),
    syncCursor: text("sync_cursor"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastFullSyncAt: timestamp("last_full_sync_at", { withTimezone: true }),
    lastSyncAttemptAt: timestamp("last_sync_attempt_at", { withTimezone: true }),
    lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "integration_connections_provider_check",
      oneOf(table.provider, INTEGRATION_PROVIDERS),
    ),
    check(
      "integration_connections_status_check",
      oneOf(table.status, CONNECTION_STATUSES),
    ),
    uniqueIndex("integration_connections_owner_provider_idx").on(
      table.ownerId,
      table.provider,
    ),
  ],
);

export type CalendarAttendee = {
  email: string;
  name: string | null;
  response: string | null;
};

// A copy of a meeting from the owner's primary Google calendar. Its text is a stranger's:
// plain text only. Deleted on disconnect and when another account connects.
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    ownerId: ownerId(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    htmlLink: text("html_link"),
    allDay: boolean("all_day").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    startsOn: date("starts_on"),
    // Google's own end: the day after an all-day event's last day.
    endsOn: date("ends_on"),
    timezone: text("timezone"),
    attendees: jsonb("attendees").$type<CalendarAttendee[]>().notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "calendar_events_when_check",
      sql`(${table.allDay} and ${table.startsOn} is not null and ${table.endsOn} is not null and ${table.startsAt} is null and ${table.endsAt} is null) or (not ${table.allDay} and ${table.startsAt} is not null and ${table.endsAt} is not null and ${table.startsOn} is null and ${table.endsOn} is null)`,
    ),
    uniqueIndex("calendar_events_connection_external_idx").on(
      table.connectionId,
      table.externalId,
    ),
    index("calendar_events_owner_starts_at_idx").on(table.ownerId, table.startsAt),
    index("calendar_events_owner_starts_on_idx").on(table.ownerId, table.startsOn),
    index("calendar_events_organization_idx").on(table.organizationId),
  ],
);

export const calendarEventContacts = pgTable(
  "calendar_event_contacts",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.contactId] }),
    index("calendar_event_contacts_contact_idx").on(table.contactId),
  ],
);
