import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getActivity } from "@/modules/activities/queries";
import { getSettings } from "@/modules/settings/service";
import { companyHref, contactHref } from "../../people/labels";
import { ActivityEditor } from "../activity-editor";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  params,
}: PageProps<"/activities/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [activity, settings] = await Promise.all([
    getActivity(owner.id, id.data),
    getSettings(owner.id),
  ]);
  if (!activity) notFound();

  return (
    <ActivityEditor
      activity={activity}
      timezone={settings?.timezone ?? "UTC"}
      cancelHref={
        activity.contacts[0]
          ? contactHref(activity.contacts[0].id, "activity")
          : activity.organizationId
            ? companyHref(activity.organizationId, "activity")
            : "/people/contacts"
      }
      heading={
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {activity.title}
        </h1>
      }
    />
  );
}
