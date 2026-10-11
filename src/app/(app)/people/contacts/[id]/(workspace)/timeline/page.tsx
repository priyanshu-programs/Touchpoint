import type { Metadata } from "next";
import { z } from "zod";
import { RecordTimeline } from "@/app/(app)/activities/record-timeline";
import { loadContact } from "../../load";

export const metadata: Metadata = { title: "Contact timeline" };

export default async function ContactTimelinePage({
  params,
  searchParams,
}: PageProps<"/people/contacts/[id]/timeline">) {
  const { owner, contact } = await loadContact((await params).id);
  const after = z.uuid().safeParse((await searchParams).after);

  return (
    <RecordTimeline
      ownerId={owner.id}
      filter={{ contactId: contact.id }}
      path={`/people/contacts/${contact.id}/timeline`}
      newHref={`/activities/new?contact=${contact.id}`}
      after={after.data}
    />
  );
}
