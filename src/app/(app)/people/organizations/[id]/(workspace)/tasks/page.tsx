import type { Metadata } from "next";
import { RecordTasks } from "@/app/(app)/tasks/record-tasks";
import { loadOrganization } from "../../load";

export const metadata: Metadata = { title: "Company tasks" };

export default async function OrganizationTasksPage({
  params,
}: PageProps<"/people/organizations/[id]/tasks">) {
  const { owner, organization } = await loadOrganization((await params).id);

  return (
    <RecordTasks
      ownerId={owner.id}
      filter={{ organizationId: organization.id }}
      newHref={`/tasks/new?organization=${organization.id}`}
    />
  );
}
