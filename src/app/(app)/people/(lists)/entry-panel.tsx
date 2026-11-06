import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { getActivity } from "@/modules/activities/queries";
import { dateIn } from "@/lib/time";
import { getMeeting } from "@/modules/integrations/meetings";
import { isCancellable, schedulingState } from "@/modules/integrations/scheduling";
import { priorityColors } from "@/modules/settings/priority-colors";
import { getSettings } from "@/modules/settings/service";
import { getTask } from "@/modules/tasks/queries";
import { ActivityEditor } from "@/app/(app)/activities/activity-editor";
import { NewActivity } from "@/app/(app)/activities/new-activity";
import { NewSend } from "@/app/(app)/materials/new-send";
import { MeetingDetails } from "@/app/(app)/meetings/meeting-details";
import { NewMeeting } from "@/app/(app)/meetings/new-meeting";
import { NewTask } from "@/app/(app)/tasks/new-task";
import { TaskEditor } from "@/app/(app)/tasks/task-editor";
import type { EntryParam } from "./list-controls";
import { PanelBackLink, PanelBackProvider } from "./panel-back";

// The entry an address asks for: a new one, or one of the owner's. An id that is not
// theirs, or is gone, is no entry, and the record is shown as if it had not been asked for.
export async function findEntry(
  ownerId: string,
  params: {
    activity?: EntryParam;
    task?: EntryParam;
    send?: "new";
    schedule?: "new";
    event?: string;
  },
) {
  if (params.schedule === "new") return { kind: "schedule" } as const;
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
    : entry.kind === "schedule"
      ? "schedule:new"
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
}) {
  const settings = await getSettings(ownerId);
  const timezone = settings?.timezone ?? "UTC";
  const colors = priorityColors(settings);
  const from = contact ? "contact" : "organization";
  const inside = contact ? organization?.id : undefined;
  const cancellable =
    entry.kind === "meeting" &&
    isCancellable(entry.meeting, dateIn(timezone)) &&
    (await schedulingState(ownerId)) === "ready";
  const title =
    entry.kind === "send"
      ? "Log a send"
      : entry.kind === "schedule"
        ? "Schedule meeting"
        : entry.kind === "task"
        ? (entry.task?.title ?? "Add task")
        : entry.kind === "meeting"
          ? entry.meeting.title
          : (entry.activity?.title ?? "Log activity");

  return (
    <PanelBackProvider>
      <header className="flex items-start gap-2 border-b p-4 pr-12">
        <PanelBackLink href={back.href} label={back.label} />
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
            cancel={
              cancellable
                ? {
                    from,
                    inside: contact ? inside : organization?.id,
                    contactId: contact?.id,
                  }
                : null
            }
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
        ) : entry.kind === "schedule" ? (
          <NewMeeting
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
              colors={colors}
              cancelHref={back.href}
              from={from}
              inside={inside}
            />
          ) : (
            <NewTask
              contact={contact}
              organization={organization}
              timezone={timezone}
              colors={colors}
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
    </PanelBackProvider>
  );
}
