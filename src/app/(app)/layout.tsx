import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { callName, greeting } from "@/lib/greeting";
import { requireOwner } from "@/lib/session";
import { googleNeedsReconnect } from "@/modules/integrations/service";
import { getSettings } from "@/modules/settings/service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Layouts are not re-rendered on every navigation, so each page also calls requireOwner().
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);
  if (!settings) redirect("/onboarding");
  const reconnect = await googleNeedsReconnect(owner.id);
  const jar = await cookies();
  const sidebar = jar.get("sidebar")?.value;
  const rawWidth = Number(jar.get("sidebar-width")?.value);
  const defaultWidth = Number.isFinite(rawWidth)
    ? Math.min(320, Math.max(56, rawWidth))
    : undefined;
  const called = callName(owner.name, settings.preferredName);

  return (
    <AppShell
      ownerName={owner.name}
      called={called}
      profile={{
        email: owner.email,
        name: owner.name,
        preferredName: settings.preferredName ?? "",
        jobTitle: settings.jobTitle ?? "",
        businessName: settings.businessName ?? "",
        phone: settings.phone ?? "",
        website: settings.website ?? "",
        location: settings.location ?? "",
      }}
      timezone={settings.timezone}
      greeting={greeting(called, settings.timezone)}
      defaultCollapsed={sidebar !== "expanded"}
      defaultWidth={defaultWidth}
    >
      {reconnect && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          Google Calendar needs reconnecting: Google no longer accepts Touchpoint&apos;s
          access. Everything else works as before.{" "}
          <Link href="/settings/integrations" className="font-medium underline">
            Reconnect
          </Link>
        </p>
      )}
      {children}
    </AppShell>
  );
}
