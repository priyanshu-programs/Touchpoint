import type { Metadata } from "next";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import { loadContact } from "../../load";

export const metadata: Metadata = { title: "Contact tasks" };

export default async function ContactTasksPage({
  params,
}: PageProps<"/people/contacts/[id]/tasks">) {
  const { owner, contact } = await loadContact((await params).id);

  return (
    <RecordTasks
      ownerId={owner.id}
      filter={{ contactId: contact.id }}
      newHref={`/tasks/new?contact=${contact.id}`}
    />
  );
}
