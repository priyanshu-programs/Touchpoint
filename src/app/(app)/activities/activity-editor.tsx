import type { ReactNode } from "react";
import { KindIcon } from "@/app/(board)/workflows/[id]/kind-icons";
import { LinkedText } from "@/components/linked-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, toLocalInput } from "@/lib/time";
import type { getActivity } from "@/modules/activities/queries";
import { attachmentKind } from "@/modules/workflows/drawing";
import { labelFor } from "../people/labels";
import { deleteActivityAction, updateActivityAction } from "./actions";
import { ActivityForm } from "./activity-form";
import { activityFormOptions } from "./form-options";

// One logged activity: what it was, a way to delete it, and its details. Shown on its
// own page and in the panel of a record it is about.
export function ActivityEditor({
  activity,
  timezone,
  cancelHref,
  heading,
  from,
  inside,
}: {
  activity: NonNullable<Awaited<ReturnType<typeof getActivity>>>;
  timezone: string;
  cancelHref: string;
  // The title, where the panel has not already given it.
  heading?: ReactNode;
  // The record whose panel this is shown in, which a delete goes back to.
  from?: "contact" | "organization";
  inside?: string;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {heading}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{labelFor(activity.kind)}</Badge>
            <span>{formatDateTime(activity.occurredAt, timezone)}</span>
          </div>
        </div>
        <form action={deleteActivityAction}>
          <input type="hidden" name="id" value={activity.id} />
          {from && <input type="hidden" name="from" value={from} />}
          {inside && <input type="hidden" name="inside" value={inside} />}
          <Button type="submit" variant="destructive">
            Delete
          </Button>
        </form>
      </div>

      {/* A meeting's notes keep their formatting here; the form below edits them as plain text. */}
      {activity.body && activity.marks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm break-words whitespace-pre-wrap">
            <LinkedText text={activity.body} marks={activity.marks} />
          </CardContent>
        </Card>
      )}

      {activity.files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {activity.files.map((file) => (
                <li key={file.id} className="flex min-w-0 items-center gap-2">
                  <KindIcon
                    kind={attachmentKind({ url: null, contentType: file.contentType })}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <a
                    href={`/api/activities/${activity.id}/files/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                  >
                    {file.title}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
            cancelHref={cancelHref}
          />
        </CardContent>
      </Card>
    </div>
  );
}
