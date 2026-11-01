import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { connection } from "next/server";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { env } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Touchpoint", template: "%s · Touchpoint" },
  description: "Personal business operating system",
  applicationName: "Touchpoint",
  appleWebApp: {
    capable: true,
    title: "Touchpoint",
    statusBarStyle: "black-translucent",
  },
  // Proves to Google that the owner runs this site, so their own OAuth client can be published.
  verification: env.GOOGLE_SITE_VERIFICATION
    ? { google: env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = { viewportFit: "cover" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The CSP nonce set in src/proxy.ts is only applied to pages rendered per request.
  await connection();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* An installed iPhone app's clock is always white, so it needs a dark strip behind it in the light theme too. No height where there is no notch. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top)] bg-[#171717]"
        />
        <Suspense>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
