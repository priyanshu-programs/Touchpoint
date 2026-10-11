import type { Metadata } from "next";
import { z } from "zod";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { loadOrganization } from "../../load";

export const metadata: Metadata = { title: "Organization timeline" };

export default async function OrganizationTimelinePage({
  params,
  searchParams,
}: PageProps<"/people/organizations/[id]/timeline">) {
  const { owner, organization } = await loadOrganization((await params).id);
  const after = z.uuid().safeParse((await searchParams).after);

  return (
    <RecordTimeline
      ownerId={owner.id}
      filter={{ organizationId: organization.id }}
      path={`/people/organizations/${organization.id}/timeline`}
      newHref={`/activities/new?organization=${organization.id}`}
      after={after.data}
    />
  );
}
