import { randomUUID } from "node:crypto";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import { firstInvitee, schedulingState } from "@/modules/integrations/scheduling";
import { ScheduleForm } from "./schedule-form";

const HOUR_MS = 3_600_000;
const FIRST_LENGTH_MS = 30 * 60_000;

// The next full hour on the owner's clock, which a half-hour zone puts off the UTC hour.
function nextHour(timezone: string) {
  const thisHour = `${toLocalInput(new Date(), timezone).slice(0, 13)}:00`;
  return new Date(fromLocalInput(thisHour, timezone).getTime() + HOUR_MS);
}

// Schedule meeting, on its own page or in the panel of the record it is about. Without
// the permission from Google, it says how to give it.
export async function NewMeeting({
  ownerId,
  contact,
  organization,
  timezone,
  inside,
  cancelHref,
}: {
  ownerId: string;
  contact: { id: string; fullName: string } | null;
  organization: { id: string; name: string } | null;
  timezone: string;
  inside?: string;
  cancelHref: string;
}) {
  const state = await schedulingState(ownerId);
  if (state === "off") {
    return (
      <p className="text-sm">
        <Link href="/settings/integrations" className="underline">
          Connect Google Calendar
        </Link>{" "}
        to schedule meetings from here.
      </p>
    );
  }
  if (state === "needs_permission") {
    return (
      <div className="grid gap-3 text-sm">
        <p>
          So far Touchpoint can only read your calendar. To add meetings to it, Google has to
          allow that first. Touchpoint adds one only after you confirm it, and never changes or
          removes your other events.
        </p>
        <a
          href="/api/integrations/google/connect?for=scheduling"
          className={buttonVariants({ className: "justify-self-start" })}
        >
          Allow scheduling
        </a>
      </div>
    );
  }

  const person = contact
    ? { id: contact.id, label: contact.fullName }
    : organization
      ? await firstInvitee(ownerId, organization.id)
      : null;
  const starts = nextHour(timezone);

  return (
    <div className="grid gap-4">
      {!contact && organization && !person && (
        <p className="text-sm text-muted-foreground">
          Nobody at {organization.name} has an email address yet. Add one to a person there, or
          invite someone else.
        </p>
      )}
      <ScheduleForm
        initial={{
          key: randomUUID(),
          title: "",
          startsAt: toLocalInput(starts, timezone),
          endsAt: toLocalInput(new Date(starts.getTime() + FIRST_LENGTH_MS), timezone),
          location: "",
          notes: "",
          emailGuests: "yes",
          addMeet: "yes",
          contacts: JSON.stringify(person ? [person] : []),
        }}
        timezone={timezone}
        from={contact ? "contact" : organization ? "organization" : undefined}
        inside={inside ?? (contact ? undefined : organization?.id)}
        cancelHref={cancelHref}
      />
    </div>
  );
}
