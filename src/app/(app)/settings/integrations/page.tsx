import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db/client";
import type { ConnectionStatus } from "@/db/schema";
import { CALENDAR_READ, CALENDAR_WRITE } from "@/integrations/google/oauth";
import { canEncrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { calendarSummary } from "@/modules/integrations/calendar";
import {
  googleClientStatus,
  googleConnection,
  googleRedirectUri,
} from "@/modules/integrations/service";
import { ownerTimezone } from "@/modules/settings/service";
import { AccountActions } from "./account-actions";
import { ClientCard, CopyButton } from "./client-form";

export const metadata: Metadata = { title: "Integrations" };

// Where Google's redirect sends the owner back, by the outcome the callback names.
const OUTCOMES: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: "Google Calendar is connected." },
  scheduling_allowed: {
    ok: true,
    message: "You can now schedule meetings from Touchpoint.",
  },
  scheduling_not_granted: {
    ok: false,
    message:
      "Google didn't allow adding meetings, so Touchpoint can still only read your calendar. To change that, press Allow scheduling and leave the box ticked.",
  },
  denied: {
    ok: false,
    message: "You chose not to allow access at Google, so nothing was connected.",
  },
  calendar_not_granted: {
    ok: false,
    message:
      "Google didn't give access to your calendar. Connect again and leave the calendar box ticked.",
  },
  incomplete: {
    ok: false,
    message:
      "Google didn't send everything Touchpoint needs. Remove Touchpoint's access in your Google account, then connect again.",
  },
  refused: {
    ok: false,
    message: "That answer from Google couldn't be checked. Start again with Connect.",
  },
  failed: {
    ok: false,
    message:
      "Google couldn't complete the connection. Check the client ID and secret, then try again.",
  },
  no_client: { ok: false, message: "Save your Google client first." },
  unreadable: {
    ok: false,
    message: "Your Google client was saved with a different encryption key. Enter it again.",
  },
  no_key: { ok: false, message: "Set APP_ENCRYPTION_KEY first." },
};

const STATUS: Record<
  ConnectionStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  connected: { label: "Connected", variant: "default" },
  expired: { label: "Expired", variant: "destructive" },
  revoked: { label: "Disconnected", variant: "secondary" },
  error: { label: "Needs attention", variant: "destructive" },
};

const SCOPE_WORDS: Record<string, string> = {
  [CALENDAR_READ]: "See your calendar events",
  [CALENDAR_WRITE]: "Add meetings to your calendar",
  "https://www.googleapis.com/auth/userinfo.email": "See your email address",
};

export default async function IntegrationsPage({
  searchParams,
}: PageProps<"/settings/integrations">) {
  const owner = await requireOwner();
  const { google } = await searchParams;
  const outcome = typeof google === "string" ? OUTCOMES[google] : undefined;

  if (!canEncrypt()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Set an encryption key first.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Touchpoint seals your Google client secret and the access Google gives it
            before storing them. Add <span className="font-mono">APP_ENCRYPTION_KEY</span>{" "}
            (at least 32 random characters) to the app&apos;s environment and restart it.
          </p>
          <p className="text-muted-foreground">
            On Vercel: Project → Settings → Environment Variables, then redeploy.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [client, connection, meetings, timezone] = await Promise.all([
    googleClientStatus(owner.id),
    googleConnection(owner.id),
    calendarSummary(owner.id),
    ownerTimezone(db, owner.id),
  ]);
  const redirectUri = googleRedirectUri();
  const homePage = `${env.APP_URL}/about`;
  const privacyPage = `${env.APP_URL}/privacy`;
  const canConnect = client?.readable === true;

  return (
    <div className="grid gap-6">
      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className={outcome.ok ? "text-sm" : "text-sm text-destructive"}
        >
          {outcome.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google account</CardTitle>
          <CardDescription>
            Touchpoint reads your Google Calendar so meetings show beside your clients.
            It uses a Google client of your own, made once in the steps below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {connection && connection.status !== "revoked" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{connection.accountEmail}</span>
                <Badge variant={STATUS[connection.status].variant}>
                  {STATUS[connection.status].label}
                </Badge>
              </div>
              <dl className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">Allowed</dt>
                <dd>
                  {connection.scopes
                    .map((scope) => SCOPE_WORDS[scope])
                    .filter(Boolean)
                    .join(", ")}
                </dd>
                <dt className="text-muted-foreground">Connected</dt>
                <dd>{formatDateTime(connection.connectedAt, timezone)}</dd>
                <dt className="text-muted-foreground">Last checked</dt>
                <dd>
                  {connection.lastRefreshAt
                    ? formatDateTime(connection.lastRefreshAt, timezone)
                    : "Not yet"}
                </dd>
                <dt className="text-muted-foreground">Last synced</dt>
                <dd>
                  {connection.lastSyncAt
                    ? formatDateTime(connection.lastSyncAt, timezone)
                    : "Not yet"}
                </dd>
                <dt className="text-muted-foreground">Meetings kept</dt>
                <dd>
                  {meetings.kept}, {meetings.linked} linked to your people or companies
                </dd>
              </dl>
              {connection.status === "connected" && connection.lastError && (
                <p role="alert" className="text-destructive">
                  {connection.lastError}
                </p>
              )}
              {connection.status === "connected" ? (
                <>
                  {!connection.scopes.includes(CALENDAR_WRITE) && canConnect && (
                    <div className="grid gap-2">
                      <p>
                        Touchpoint can only read your calendar for now. Allow scheduling to add
                        meetings from here; it adds one only after you confirm it.
                      </p>
                      <a
                        href="/api/integrations/google/connect?for=scheduling"
                        className={buttonVariants({
                          variant: "outline",
                          className: "justify-self-start",
                        })}
                      >
                        Allow scheduling
                      </a>
                    </div>
                  )}
                  <AccountActions email={connection.accountEmail} />
                </>
              ) : (
                <div className="grid gap-3">
                  <p role="alert" className="text-destructive">
                    {connection.status === "expired"
                      ? "Google no longer accepts this connection, so calendar reading is paused. Everything else works as before."
                      : "This connection can't be used: it was saved with a different encryption key."}
                  </p>
                  {canConnect && (
                    <a
                      href="/api/integrations/google/connect"
                      className={buttonVariants({ className: "justify-self-start" })}
                    >
                      Reconnect
                    </a>
                  )}
                </div>
              )}
            </>
          ) : canConnect ? (
            <a
              href="/api/integrations/google/connect"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              Connect Google Calendar
            </a>
          ) : (
            <p className="text-muted-foreground">
              Save your Google client below, then connect.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Google client</CardTitle>
          <CardDescription>
            Made in your own Google Cloud project, free. The secret is stored encrypted and
            never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientCard
            saved={client && { idEnding: client.idEnding, readable: client.readable }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Making your Google client</CardTitle>
          <CardDescription>Once, in about ten minutes.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <ol className="grid list-decimal gap-3 pl-5">
            <li>
              In the Google Cloud console (console.cloud.google.com), create a project and
              turn on the <span className="font-medium">Google Calendar API</span> for it.
            </li>
            <li>
              Under Google Auth Platform, set up the consent screen as{" "}
              <span className="font-medium">External</span>, and under Audience add your own
              Gmail as a test user. That is enough to connect now, but in Testing Google ends
              the connection every 7 days, so publish it next.
            </li>
            <li className="grid gap-2">
              <span>
                Prove the site is yours: in Google Search Console (search.google.com/search-console)
                add a URL-prefix property for{" "}
                <span className="font-mono">{env.APP_URL}</span>, pick{" "}
                <span className="font-medium">HTML tag</span>, and set the code it shows as{" "}
                <span className="font-mono">GOOGLE_SITE_VERIFICATION</span> in the app&apos;s
                environment, then press Verify.
                {env.GOOGLE_SITE_VERIFICATION ? " (It is set on this site.)" : ""}
              </span>
            </li>
            <li className="grid gap-2">
              <span>
                Under Branding, give these as the home page and privacy policy, and{" "}
                <span className="font-mono">{new URL(env.APP_URL).host}</span> as the authorised
                domain:
              </span>
              {[homePage, privacyPage].map((address) => (
                <span key={address} className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                    {address}
                  </code>
                  <CopyButton text={address} label="Copy" />
                </span>
              ))}
              <span>
                Then under Audience press <span className="font-medium">Publish app</span>.
                Google checks the pages, which can take a few days; don&apos;t send it for
                verification. When you connect, Google warns that the app isn&apos;t verified:
                it is your own, so choose Advanced, then go on.
              </span>
            </li>
            <li className="grid gap-2">
              <span>
                Under Clients, create an OAuth client of type{" "}
                <span className="font-medium">Web application</span> and add this as an
                authorised redirect URI:
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                  {redirectUri}
                </code>
                <CopyButton text={redirectUri} label="Copy" />
              </span>
            </li>
            <li>Paste the client ID and secret under Your Google client, then connect.</li>
            <li>
              To schedule meetings from Touchpoint, add{" "}
              <span className="font-mono break-all">{CALENDAR_WRITE}</span> under Data Access, then
              press Allow scheduling above.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
