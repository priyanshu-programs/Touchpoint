import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { getContact } from "@/modules/contacts/queries";
import { getMeeting } from "@/modules/integrations/meetings";
import { getOrganization } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { NewActivity } from "../new-activity";

export const metadata: Metadata = { title: "Log activity" };

export default async function NewActivityPage({
  searchParams,
}: PageProps<"/activities/new">) {
  const owner = await requireOwner();
  const query = await searchParams;
  const contactId = z.uuid().safeParse(query.contact);
  const organizationId = z.uuid().safeParse(query.organization);
  const eventId = z.uuid().safeParse(query.event);
  const [settings, contact, organization, meeting] = await Promise.all([
    getSettings(owner.id),
    contactId.success ? getContact(owner.id, contactId.data) : null,
    organizationId.success ? getOrganization(owner.id, organizationId.data) : null,
    eventId.success ? getMeeting(owner.id, eventId.data) : null,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Log activity</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewActivity
          contact={contact}
          organization={organization}
          meeting={meeting}
          timezone={settings?.timezone ?? "UTC"}
          cancelHref={
            meeting
              ? `/meetings/${meeting.id}`
              : contact
                ? contactHref(contact.id, "activity")
                : organization
                  ? companyHref(organization.id, "activity")
                  : "/people/contacts"
          }
        />
      </CardContent>
    </Card>
  );
}
