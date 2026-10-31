import { NextResponse, type NextRequest } from "next/server";
import { canEncrypt, UnreadableSecretError } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getOwner } from "@/lib/session";
import { startGoogleConnect } from "@/modules/integrations/service";
import { SCHEDULING, settingsPage, STATE_COOKIE, STATE_COOKIE_OPTIONS } from "../cookie";

// A plain link, not a form: the pages' form-action 'self' would stop a form's redirect
// to Google. On its own it only opens Google's consent screen, which the owner must approve.
export async function GET(request: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.redirect(new URL("/sign-in", env.APP_URL), 303);
  if (!canEncrypt()) return NextResponse.redirect(settingsPage("no_key"), 303);

  const scheduling = request.nextUrl.searchParams.get("for") === SCHEDULING;

  let started;
  try {
    started = await startGoogleConnect(owner.id, { scheduling });
  } catch (error) {
    if (!(error instanceof UnreadableSecretError)) throw error;
    return NextResponse.redirect(settingsPage("unreadable"), 303);
  }
  if (!started) return NextResponse.redirect(settingsPage("no_client"), 303);

  const response = NextResponse.redirect(started.url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  const wish = scheduling ? `.${SCHEDULING}` : "";
  response.cookies.set(STATE_COOKIE, `${started.state}.${started.verifier}${wish}`, {
    ...STATE_COOKIE_OPTIONS,
    maxAge: 600,
  });
  return response;
}
