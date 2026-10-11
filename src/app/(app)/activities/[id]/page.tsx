import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { formatDateTime, toLocalInput } from "@/lib/time";
import { getActivity } from "@/modules/activities/queries";
import { getSettings } from "@/modules/settings/service";
import { labelFor } from "../../people/labels";
import { deleteActivityAction, updateActivityAction } from "../actions";
import { ActivityForm } from "../activity-form";
import { activityFormOptions } from "../form-options";

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
  const timezone = settings?.timezone ?? "UTC";
  const back = activity.contacts[0]
    ? `/people/contacts/${activity.contacts[0].id}/timeline`
    : activity.organizationId
      ? `/people/organizations/${activity.organizationId}/timeline`
      : "/people/contacts";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {activity.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{labelFor(activity.kind)}</Badge>
            <span>{formatDateTime(activity.occurredAt, timezone)}</span>
          </div>
        </div>
        <form action={deleteActivityAction}>
          <input type="hidden" name="id" value={activity.id} />
          <Button type="submit" variant="destructive">
            Delete
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityForm
            action={updateActivityAction.bind(null, activity.id)}
            initial={{
              kind: activity.kind,
              direction: activity.direction ?? "",
              occurredAt: toLocalInput(activity.occurredAt, timezone),
              title: activity.title,
              body: activity.body ?? "",
              outcome: activity.outcome ?? "",
              contacts: JSON.stringify(
                activity.contacts.map(({ id, name }) => ({ id, label: name })),
              ),
              organizationId: activity.organizationId ?? "",
              organizationName: activity.organizationName ?? "",
            }}
            options={activityFormOptions}
            timezone={timezone}
            submitLabel="Save changes"
            cancelHref={back}
          />
        </CardContent>
      </Card>
    </div>
  );
}
