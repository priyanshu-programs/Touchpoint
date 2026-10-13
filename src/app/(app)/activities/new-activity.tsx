import { toLocalInput } from "@/lib/time";
import { logActivityAction } from "./actions";
import { ActivityForm } from "./activity-form";
import { activityFormOptions } from "./form-options";

// The form that logs an activity, on its own page or in the panel of the record it is about.
export function NewActivity({
  contact,
  organization,
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
  timezone: string;
  inside?: string;
  cancelHref: string;
}) {
  const only = contact?.companies.length === 1 ? contact.companies[0] : null;

  return (
    <ActivityForm
      action={logActivityAction}
      initial={{
        kind: "note",
        direction: "",
        occurredAt: toLocalInput(new Date(), timezone),
        title: "",
        body: "",
        outcome: "",
        contacts: JSON.stringify(
          contact ? [{ id: contact.id, label: contact.fullName }] : [],
        ),
        // What happened with a person is also part of their organization's history,
        // when they have just the one.
        organizationId: (organization ?? only)?.id ?? "",
        organizationName: (organization ?? only)?.name ?? "",
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
