import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, ownerId, updatedAt } from "./columns";

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
