import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/modules/settings/service";

// A whiteboard takes the whole window, so it sits outside the sidebar and top bar.
export default async function BoardLayout({ children }: LayoutProps<"/">) {
  const owner = await requireOwner();
  if (!(await getSettings(owner.id))) redirect("/onboarding");

  return children;
}
