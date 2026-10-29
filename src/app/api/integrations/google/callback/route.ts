import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getOwner } from "@/lib/session";
import { completeGoogleConnect } from "@/modules/integrations/service";
import { settingsPage, STATE_COOKIE, STATE_COOKIE_OPTIONS } from "../cookie";

// Google adds parameters of its own (scope, authuser, prompt); only these are read.
const callbackQuery = z.object({
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().min(1).max(200).optional(),
});

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function GET(request: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.redirect(new URL("/sign-in", env.APP_URL), 303);

  const back = (outcome: string) => {
    const response = NextResponse.redirect(settingsPage(outcome), 303);
    response.cookies.set(STATE_COOKIE, "", { ...STATE_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  };

  const saved = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const [state, verifier] = saved.split(".");
  const query = callbackQuery.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success || !state || !verifier || !sameText(state, query.data.state)) {
    return back("refused");
  }
  if (query.data.error) {
    return back(query.data.error === "access_denied" ? "denied" : "failed");
  }
  if (!query.data.code) return back("refused");

  try {
    const result = await completeGoogleConnect(owner.id, query.data.code, verifier);
    return back(result.ok ? "connected" : result.reason);
  } catch (error) {
    logger.error("integration.connect_failed", { ownerId: owner.id, error });
    return back("failed");
  }
}
