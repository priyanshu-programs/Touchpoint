import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { greeting } from "@/lib/greeting";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/modules/settings/service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Layouts are not re-rendered on every navigation, so each page also calls requireOwner().
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);
  if (!settings) redirect("/onboarding");
  const jar = await cookies();
  const sidebar = jar.get("sidebar")?.value;
  const rawWidth = Number(jar.get("sidebar-width")?.value);
  const defaultWidth = Number.isFinite(rawWidth)
    ? Math.min(320, Math.max(56, rawWidth))
    : undefined;

  return (
    <AppShell
      ownerName={owner.name}
      timezone={settings.timezone}
      greeting={greeting(owner.name, settings.timezone)}
      defaultCollapsed={sidebar !== "expanded"}
      defaultWidth={defaultWidth}
    >
      {children}
    </AppShell>
  );
}
