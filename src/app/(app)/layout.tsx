import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/modules/settings/service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Layouts are not re-rendered on every navigation, so each page also calls requireOwner().
  const owner = await requireOwner();
  if (!(await getSettings(owner.id))) redirect("/onboarding");
  const sidebar = (await cookies()).get("sidebar")?.value;

  return (
    <AppShell ownerName={owner.name} defaultCollapsed={sidebar !== "expanded"}>
      {children}
    </AppShell>
  );
}
