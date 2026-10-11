import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { companyHref } from "../../labels";

// A company is shown as a panel over the list; this keeps older links to it working.
export default async function OrganizationPage({
  params,
}: PageProps<"/people/organizations/[id]">) {
  await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  redirect(companyHref(id.data));
}
