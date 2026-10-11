import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { contactHref } from "../../labels";

// A person is shown as a panel over the people list; this keeps older links to them working.
export default async function ContactPage({
  params,
}: PageProps<"/people/contacts/[id]">) {
  await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  redirect(contactHref(id.data));
}
