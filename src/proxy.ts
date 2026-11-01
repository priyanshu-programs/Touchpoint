import { NextResponse, type NextRequest } from "next/server";
import { BOARD_PAGE } from "@/lib/board-page";
import { env } from "@/lib/env";
import { liveRoomOrigin } from "@/lib/live-room";

export function buildCsp(
  nonce: string,
  { isDev, isHttps, liveRoom }: { isDev: boolean; isHttps: boolean; liveRoom?: string },
) {
  return [
    "default-src 'self'",
    // React needs eval in development only, for error stack reconstruction.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // UI primitives emit inline style attributes in server-rendered markup, which a nonce cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    liveRoom ? `connect-src 'self' ${liveRoom}` : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Self-hosted instances on plain http (localhost, LAN) would break if requests were upgraded.
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    isDev: process.env.NODE_ENV === "development",
    isHttps: env.APP_URL.startsWith("https://"),
    // Only a brainstorm board's own page may reach the live room.
    liveRoom: BOARD_PAGE.test(request.nextUrl.pathname) ? liveRoomOrigin() : undefined,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
