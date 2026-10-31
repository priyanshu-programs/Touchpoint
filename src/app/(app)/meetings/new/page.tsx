import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/modules/settings/service";
import { NewMeeting } from "../new-meeting";

export const metadata: Metadata = { title: "Schedule meeting" };

export default async function NewMeetingPage() {
  const owner = await requireOwner();
  const settings = await getSettings(owner.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Schedule meeting</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewMeeting
          ownerId={owner.id}
          contact={null}
          organization={null}
          timezone={settings?.timezone ?? "UTC"}
          cancelHref="/tasks/calendar"
        />
      </CardContent>
    </Card>
  );
}
