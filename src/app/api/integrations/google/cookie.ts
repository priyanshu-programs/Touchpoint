import { env } from "@/lib/env";

// SameSite=Lax, so it comes back with Google's redirect (security.md's approved deviation).
export const STATE_COOKIE = "tp_google_oauth";
// Said in the connect address and kept in the cookie, so the callback knows what was asked.
export const SCHEDULING = "scheduling";
export const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.APP_URL.startsWith("https://"),
  path: "/api/integrations/google",
};

export const settingsPage = (outcome: string) =>
  new URL(`/settings/integrations?google=${outcome}`, env.APP_URL);
