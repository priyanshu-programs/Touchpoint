import type { Metadata } from "next";
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
  // Proves to Google that the owner runs this site, so their own OAuth client can be published.
  verification: env.GOOGLE_SITE_VERIFICATION
    ? { google: env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The CSP nonce set in src/proxy.ts is only applied to pages rendered per request.
  await connection();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
