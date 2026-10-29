import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/system", label: "System status" },
  { href: "/settings/audit", label: "Audit log" },
  { href: "/settings/export", label: "Export" },
];

export default function SettingsLayout({
  children,
}: LayoutProps<"/settings">) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <TabNav label="Settings" tabs={TABS} />
      {children}
    </div>
  );
}
