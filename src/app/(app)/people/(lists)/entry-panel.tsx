import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { getActivity } from "@/modules/activities/queries";
import { getMeeting } from "@/modules/integrations/meetings";
import { getSettings } from "@/modules/settings/service";
import { getTask } from "@/modules/tasks/queries";
import { ActivityEditor } from "@/app/(app)/activities/activity-editor";
import { NewActivity } from "@/app/(app)/activities/new-activity";
import { NewSend } from "@/app/(app)/materials/new-send";
import { MeetingDetails } from "@/app/(app)/meetings/meeting-details";
import { NewTask } from "@/app/(app)/tasks/new-task";
import { TaskEditor } from "@/app/(app)/tasks/task-editor";
import type { EntryParam } from "./list-controls";

// The entry an address asks for: a new one, or one of the owner's. An id that is not
// theirs, or is gone, is no entry, and the record is shown as if it had not been asked for.
export async function findEntry(
  ownerId: string,
  params: { activity?: EntryParam; task?: EntryParam; send?: "new"; event?: string },
) {
  if (params.send === "new") return { kind: "send" } as const;
  if (params.task === "new") return { kind: "task", task: null } as const;
  if (params.task) {
    const task = await getTask(ownerId, params.task);
    if (task) return { kind: "task", task } as const;
  }
  const meeting = params.event ? await getMeeting(ownerId, params.event) : null;
  if (params.activity === "new") {
    return { kind: "activity", activity: null, meeting } as const;
  }
  if (params.activity) {
    const activity = await getActivity(ownerId, params.activity);
    if (activity) return { kind: "activity", activity, meeting: null } as const;
  }
  if (meeting) return { kind: "meeting", meeting } as const;
  return null;
}
export type Entry = NonNullable<Awaited<ReturnType<typeof findEntry>>>;

export const entryKey = (entry: Entry) =>
  entry.kind === "send"
    ? "send:new"
    : entry.kind === "task"
      ? `task:${entry.task?.id ?? "new"}`
      : entry.kind === "meeting"
        ? `meeting:${entry.meeting.id}`
        : `activity:${entry.activity?.id ?? "new"}:${entry.meeting?.id ?? ""}`;

// The meeting an address names, once it is found to be the owner's.
export const entryMeetingId = (entry: Entry | null) =>
  entry && (entry.kind === "meeting" || entry.kind === "activity")
    ? entry.meeting?.id
    : undefined;

// The tab of the record that an entry of this kind is listed on, and goes back to.
export const entryTab = (entry: Entry) =>
  entry.kind === "task" ? "tasks" : "activity";

// One activity or task, new or existing. It takes the place of the open record in the
// panel until the owner goes back.
export async function EntryPanel({
  ownerId,
  entry,
  contact,
  organization,
  back,
  notesHref,
}: {
  ownerId: string;
  entry: Entry;
  // Whose panel this is: a person, a company, or both for a person inside a company's panel.
  contact: {
    id: string;
    fullName: string;
    companies: { id: string; name: string }[];
  } | null;
  organization: { id: string; name: string } | null;
  back: { href: string; label: string };
  // Log activity, in this panel, filled in from a meeting.
  notesHref: (meetingId: string) => string;
}) {
  const timezone = (await getSettings(ownerId))?.timezone ?? "UTC";
  const from = contact ? "contact" : "organization";
  const inside = contact ? organization?.id : undefined;
  const title =
    entry.kind === "send"
      ? "Log a send"
      : entry.kind === "task"
        ? (entry.task?.title ?? "Add task")
        : entry.kind === "meeting"
          ? entry.meeting.title
          : (entry.activity?.title ?? "Log activity");

  return (
    <>
      <header className="flex items-start gap-2 border-b p-4 pr-12">
        <Link
          href={back.href}
          scroll={false}
          aria-label={back.label}
          className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="text-lg break-words">{title}</SheetTitle>
          <SheetDescription>
            {[contact?.fullName, organization?.name].filter(Boolean).join(" at ")}
          </SheetDescription>
        </div>
      </header>

      <div className="p-4">
        {entry.kind === "meeting" ? (
          <MeetingDetails
            meeting={entry.meeting}
            timezone={timezone}
            notesHref={notesHref(entry.meeting.id)}
          />
        ) : entry.kind === "send" ? (
          <NewSend
            ownerId={ownerId}
            contact={contact}
            organization={organization}
            timezone={timezone}
            inside={inside}
            cancelHref={back.href}
          />
        ) : entry.kind === "task" ? (
          entry.task ? (
            <TaskEditor
              task={entry.task}
              timezone={timezone}
              cancelHref={back.href}
            />
          ) : (
            <NewTask
              contact={contact}
              organization={organization}
              timezone={timezone}
              inside={inside}
              cancelHref={back.href}
            />
          )
        ) : entry.activity ? (
          <ActivityEditor
            activity={entry.activity}
            timezone={timezone}
            cancelHref={back.href}
            from={from}
            inside={inside}
          />
        ) : (
          <NewActivity
            contact={contact}
            organization={organization}
            meeting={entry.meeting}
            timezone={timezone}
            inside={inside}
            cancelHref={back.href}
          />
        )}
      </div>
    </>
  );
}
