import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getMeeting } from "@/modules/integrations/meetings";
import { getSettings } from "@/modules/settings/service";
import { MeetingDetails } from "../meeting-details";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  const [meeting, settings] = await Promise.all([
    id.success ? getMeeting(owner.id, id.data) : null,
    getSettings(owner.id),
  ]);
  if (!meeting) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="break-words">{meeting.title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MeetingDetails
          meeting={meeting}
          timezone={settings?.timezone ?? "UTC"}
          notesHref={`/activities/new?event=${meeting.id}`}
        />
      </CardContent>
    </Card>
  );
}
