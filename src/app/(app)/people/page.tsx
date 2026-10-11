import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";

export default async function PeoplePage() {
  await requireOwner();
  redirect("/people/contacts");
}
