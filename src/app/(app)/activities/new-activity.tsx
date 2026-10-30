import { toLocalInput } from "@/lib/time";
import { ACTIVITY_LIMITS } from "@/modules/activities/schema";
import type { Meeting } from "@/modules/integrations/meetings";
import { logActivityAction } from "./actions";
import { ActivityForm } from "./activity-form";
import { activityFormOptions } from "./form-options";

// The form that logs an activity, on its own page or in the panel of the record it is about.
// Given a meeting, it starts filled in from that meeting; nothing is kept until it is saved.
export function NewActivity({
  contact,
  organization,
  meeting,
  timezone,
  inside,
  cancelHref,
}: {
  contact: {
    id: string;
    fullName: string;
    companies: { id: string; name: string }[];
  } | null;
  organization: { id: string; name: string } | null;
  meeting?: Meeting | null;
  timezone: string;
  inside?: string;
  cancelHref: string;
}) {
  const only = contact?.companies.length === 1 ? contact.companies[0] : null;
  const people = [
    ...(contact ? [{ id: contact.id, label: contact.fullName }] : []),
    ...(meeting?.people ?? [])
      .filter((person) => person.id !== contact?.id)
      .map((person) => ({ id: person.id, label: person.name })),
  ].slice(0, ACTIVITY_LIMITS.people);
  const company = organization ?? meeting?.organization ?? only;

  return (
    <ActivityForm
      action={logActivityAction}
      initial={{
        kind: meeting ? "meeting" : "note",
        direction: "",
        occurredAt: !meeting
          ? toLocalInput(new Date(), timezone)
          : meeting.allDay
            ? `${meeting.startsOn}T12:00`
            : toLocalInput(meeting.startsAt!, timezone),
        title: meeting?.title.slice(0, ACTIVITY_LIMITS.title) ?? "",
        body: "",
        outcome: "",
        contacts: JSON.stringify(people),
        // What happened with a person is also part of their organization's history,
        // when they have just the one.
        organizationId: company?.id ?? "",
        organizationName: company?.name ?? "",
        followUpDate: "",
        followUpTitle: "",
      }}
      options={activityFormOptions}
      timezone={timezone}
      from={contact ? "contact" : organization ? "organization" : undefined}
      inside={inside}
      followUp
      submitLabel="Log activity"
      cancelHref={cancelHref}
    />
  );
}
