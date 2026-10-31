import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { calendarEvents, integrationClients, integrationConnections } from "@/db/schema";
import {
  CALENDAR_READ,
  CALENDAR_WRITE,
  consentUrl,
  exchangeCode,
  GoogleApiError,
  GrantRevokedError,
  primaryCalendarName,
  refreshAccess,
  revokeGrant,
  type GoogleClient,
} from "@/integrations/google/oauth";
import {
  decryptSecret,
  encryptSecret,
  UnreadableSecretError,
} from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit/service";
import { enqueue, type ClaimedJob } from "@/modules/jobs/service";
import type { GoogleClientInput } from "./schema";

const GOOGLE = "google";
export const GOOGLE_CHECK_JOB = "google.check";
// The 8-day evidence: a connection is refreshed at least this often, even when nothing uses it.
const CHECK_EVERY_MS = 24 * 60 * 60_000;
// An access token this close to its end is refreshed before use.
const EXPIRY_MARGIN_MS = 60_000;

export const googleRedirectUri = () =>
  `${env.APP_URL}/api/integrations/google/callback`;

export const ACCESS_NOT_ACCEPTED =
  "Google didn't accept this connection's access. Press Test connection, or disconnect and connect again.";

// Not connected, expired at Google, or sealed with another key: the owner has to act.
export class ConnectionUnavailableError extends Error {}

const ownGoogle = (ownerId: string) =>
  and(
    eq(integrationClients.ownerId, ownerId),
    eq(integrationClients.provider, GOOGLE),
  );
const ownConnection = (ownerId: string) =>
  and(
    eq(integrationConnections.ownerId, ownerId),
    eq(integrationConnections.provider, GOOGLE),
  );

// The part before ".apps.googleusercontent.com", whose end tells one client from another.
const idEnding = (clientId: string) => clientId.split(".")[0].slice(-4);

async function clientRow(ownerId: string) {
  const [row] = await db
    .select()
    .from(integrationClients)
    .where(ownGoogle(ownerId));
  return row ?? null;
}

async function connectionRow(ownerId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(ownConnection(ownerId));
  return row ?? null;
}

async function openClient(ownerId: string): Promise<GoogleClient | null> {
  const row = await clientRow(ownerId);
  if (!row) return null;
  return {
    clientId: row.clientId,
    clientSecret: decryptSecret(row.clientSecretEnc, row.keyVersion),
    redirectUri: googleRedirectUri(),
  };
}

export async function googleClientStatus(ownerId: string) {
  const row = await clientRow(ownerId);
  if (!row) return null;
  let readable = true;
  try {
    decryptSecret(row.clientSecretEnc, row.keyVersion);
  } catch (error) {
    if (!(error instanceof UnreadableSecretError)) throw error;
    readable = false;
  }
  return { idEnding: idEnding(row.clientId), readable, savedAt: row.updatedAt };
}

// What the Settings page shows; tokens never leave this module.
export async function googleConnection(ownerId: string) {
  const row = await connectionRow(ownerId);
  if (!row) return null;
  return {
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    status: row.status,
    connectedAt: row.connectedAt,
    lastRefreshAt: row.lastRefreshAt,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
  };
}

export async function googleNeedsReconnect(ownerId: string) {
  const row = await connectionRow(ownerId);
  return row?.status === "expired" || row?.status === "error";
}

export async function saveGoogleClient(ownerId: string, input: GoogleClientInput) {
  const existing = await clientRow(ownerId);
  // A refresh token works only with the client that was granted it.
  if (existing && existing.clientId !== input.clientId) {
    await disconnectGoogle(ownerId);
  }
  const sealed = encryptSecret(input.clientSecret);
  await db.transaction(async (tx) => {
    await tx
      .insert(integrationClients)
      .values({
        ownerId,
        provider: GOOGLE,
        clientId: input.clientId,
        clientSecretEnc: sealed.value,
        keyVersion: sealed.keyVersion,
      })
      .onConflictDoUpdate({
        target: [integrationClients.ownerId, integrationClients.provider],
        set: {
          clientId: input.clientId,
          clientSecretEnc: sealed.value,
          keyVersion: sealed.keyVersion,
        },
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "integration.client_save",
      entityType: "integration",
      before: existing ? { clientIdEnding: idEnding(existing.clientId) } : undefined,
      after: { provider: GOOGLE, clientIdEnding: idEnding(input.clientId) },
    });
  });
}

export async function removeGoogleClient(ownerId: string) {
  const existing = await clientRow(ownerId);
  if (!existing) return;
  await disconnectGoogle(ownerId);
  await db.transaction(async (tx) => {
    await tx.delete(integrationConnections).where(ownConnection(ownerId));
    await tx.delete(integrationClients).where(ownGoogle(ownerId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "integration.client_remove",
      entityType: "integration",
      before: { provider: GOOGLE, clientIdEnding: idEnding(existing.clientId) },
    });
  });
}

// Null when there is no client to connect with.
export async function startGoogleConnect(
  ownerId: string,
  { scheduling = false }: { scheduling?: boolean } = {},
) {
  const client = await openClient(ownerId);
  if (!client) return null;
  return consentUrl(client, scheduling ? [CALENDAR_READ, CALENDAR_WRITE] : [CALENDAR_READ]);
}

export type ConnectRefusal = "no_client" | "calendar_not_granted" | "incomplete";

export async function completeGoogleConnect(
  ownerId: string,
  code: string,
  verifier: string,
): Promise<{ ok: true; canSchedule: boolean } | { ok: false; reason: ConnectRefusal }> {
  const client = await openClient(ownerId);
  if (!client) return { ok: false, reason: "no_client" };
  const granted = await exchangeCode(client, code, verifier);

  // Google lets the owner untick a permission on its consent screen.
  if (!granted.scopes.includes(CALENDAR_READ)) {
    try {
      await revokeGrant(client, granted.refreshToken ?? granted.accessToken);
    } catch (error) {
      logger.warn("integration.revoke_failed", { ownerId, error });
    }
    return { ok: false, reason: "calendar_not_granted" };
  }
  if (!granted.refreshToken || !granted.email) {
    return { ok: false, reason: "incomplete" };
  }

  const access = encryptSecret(granted.accessToken);
  const refresh = encryptSecret(granted.refreshToken);
  const now = new Date();
  const email = granted.email;
  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ accountEmail: integrationConnections.accountEmail, syncCursor: integrationConnections.syncCursor })
      .from(integrationConnections)
      .where(ownConnection(ownerId))
      .for("update");
    if (previous && previous.accountEmail !== email) {
      await tx.delete(calendarEvents).where(eq(calendarEvents.ownerId, ownerId));
    }
    const values = {
      accountEmail: email,
      scopes: granted.scopes,
      status: "connected" as const,
      refreshTokenEnc: refresh.value,
      accessTokenEnc: access.value,
      accessExpiresAt: granted.expiresAt,
      keyVersion: refresh.keyVersion,
      // Another account's calendar starts its sync again.
      syncCursor: previous?.accountEmail === email ? previous.syncCursor : null,
      lastRefreshAt: now,
      lastError: null,
      connectedAt: now,
    };
    await tx
      .insert(integrationConnections)
      .values({ ownerId, provider: GOOGLE, ...values })
      .onConflictDoUpdate({
        target: [integrationConnections.ownerId, integrationConnections.provider],
        set: values,
      });
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "integration.connect",
      entityType: "integration",
      after: { provider: GOOGLE, accountEmail: email, scopes: granted.scopes },
    });
  });
  return { ok: true, canSchedule: granted.scopes.includes(CALENDAR_WRITE) };
}

async function markUnavailable(
  ownerId: string,
  status: "expired" | "error",
  reason: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(integrationConnections)
      .set({
        status,
        lastError: reason,
        refreshTokenEnc: status === "expired" ? null : undefined,
        accessTokenEnc: null,
        accessExpiresAt: null,
      })
      .where(ownConnection(ownerId));
    await audit(tx, {
      ownerId,
      actor: "system",
      action: `integration.${status === "expired" ? "expire" : "error"}`,
      entityType: "integration",
      after: { provider: GOOGLE, reason },
    });
  });
}

async function refreshConnection(
  ownerId: string,
  row: typeof integrationConnections.$inferSelect,
) {
  try {
    const client = await openClient(ownerId);
    if (!client || !row.refreshTokenEnc) {
      throw new ConnectionUnavailableError("No client to refresh with");
    }
    const fresh = await refreshAccess(
      client,
      decryptSecret(row.refreshTokenEnc, row.keyVersion),
    );
    const sealed = encryptSecret(fresh.accessToken);
    await db
      .update(integrationConnections)
      .set({
        accessTokenEnc: sealed.value,
        accessExpiresAt: fresh.expiresAt,
        lastRefreshAt: new Date(),
        lastError: null,
      })
      .where(ownConnection(ownerId));
    return fresh.accessToken;
  } catch (error) {
    if (error instanceof GrantRevokedError) {
      await markUnavailable(ownerId, "expired", error.message);
      throw new ConnectionUnavailableError(error.message);
    }
    if (error instanceof UnreadableSecretError) {
      await markUnavailable(ownerId, "error", "Saved with another encryption key");
      throw new ConnectionUnavailableError(error.message);
    }
    if (error instanceof ConnectionUnavailableError) throw error;
    await db
      .update(integrationConnections)
      .set({ lastError: error instanceof Error ? error.message.slice(0, 500) : "Refresh failed" })
      .where(ownConnection(ownerId));
    throw error;
  }
}

// A working access token, refreshed when it is about to run out (or always, with force).
export async function googleAccessToken(
  ownerId: string,
  { force = false }: { force?: boolean } = {},
) {
  const row = await connectionRow(ownerId);
  if (row?.status !== "connected") {
    throw new ConnectionUnavailableError("Google is not connected");
  }
  if (
    !force &&
    row.accessTokenEnc &&
    row.accessExpiresAt &&
    row.accessExpiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS
  ) {
    try {
      return decryptSecret(row.accessTokenEnc, row.keyVersion);
    } catch (error) {
      if (!(error instanceof UnreadableSecretError)) throw error;
    }
  }
  return refreshConnection(ownerId, row);
}

export async function testGoogleConnection(ownerId: string) {
  try {
    const token = await googleAccessToken(ownerId, { force: true });
    return { ok: true as const, calendar: await primaryCalendarName(token) };
  } catch (error) {
    if (error instanceof ConnectionUnavailableError) {
      return {
        ok: false as const,
        message: "Google no longer accepts this connection. Reconnect to go on.",
      };
    }
    if (error instanceof GoogleApiError && error.status === 403) {
      return {
        ok: false as const,
        message:
          "Google refused to show your calendar. Check that the Google Calendar API is enabled in your Google Cloud project.",
      };
    }
    logger.error("integration.test_failed", { ownerId, error });
    if (error instanceof GoogleApiError && error.status === 401) {
      return { ok: false as const, message: ACCESS_NOT_ACCEPTED };
    }
    return {
      ok: false as const,
      message: "Google could not be reached. Try again in a moment.",
    };
  }
}

export async function disconnectGoogle(ownerId: string) {
  const row = await connectionRow(ownerId);
  if (!row || row.status === "revoked") return;
  if (row.refreshTokenEnc) {
    try {
      const client = await openClient(ownerId);
      if (client) {
        await revokeGrant(client, decryptSecret(row.refreshTokenEnc, row.keyVersion));
      }
    } catch (error) {
      // The access is dropped here either way; the owner can also remove it at Google.
      logger.warn("integration.revoke_failed", { ownerId, error });
    }
  }
  await db.transaction(async (tx) => {
    const meetings = await tx
      .delete(calendarEvents)
      .where(eq(calendarEvents.ownerId, ownerId))
      .returning({ id: calendarEvents.id });
    await tx
      .update(integrationConnections)
      .set({
        status: "revoked",
        refreshTokenEnc: null,
        accessTokenEnc: null,
        accessExpiresAt: null,
        syncCursor: null,
        lastError: null,
      })
      .where(ownConnection(ownerId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "integration.disconnect",
      entityType: "integration",
      before: {
        provider: GOOGLE,
        accountEmail: row.accountEmail,
        meetingsRemoved: meetings.length,
      },
    });
  });
}

export async function enqueueGoogleChecks() {
  const due = await db
    .select({ ownerId: integrationConnections.ownerId })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.status, "connected"),
        or(
          isNull(integrationConnections.lastRefreshAt),
          lt(
            integrationConnections.lastRefreshAt,
            new Date(Date.now() - CHECK_EVERY_MS),
          ),
        ),
      ),
    );
  for (const { ownerId } of due) {
    await enqueue({
      kind: GOOGLE_CHECK_JOB,
      ownerId,
      dedupeKey: `${GOOGLE_CHECK_JOB}:${ownerId}`,
    });
  }
}

export async function checkGoogleConnection(job: ClaimedJob) {
  if (!job.ownerId) return;
  try {
    await googleAccessToken(job.ownerId, { force: true });
  } catch (error) {
    // Already marked expired or unreadable; the banner asks the owner to reconnect.
    if (!(error instanceof ConnectionUnavailableError)) throw error;
  }
}
