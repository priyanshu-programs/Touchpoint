import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({
  children,
}: LayoutProps<"/settings">) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
