import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { getContact } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { priorityColors } from "@/modules/settings/priority-colors";
import { getSettings } from "@/modules/settings/service";
import { NewTask } from "../new-task";

export const metadata: Metadata = { title: "Add task" };

export default async function NewTaskPage({
  searchParams,
}: PageProps<"/tasks/new">) {
  const owner = await requireOwner();
  const query = await searchParams;
  const contactId = z.uuid().safeParse(query.contact);
  const organizationId = z.uuid().safeParse(query.organization);
  // A day picked on the calendar only fills the form; the form's own checks still apply.
  const due = z.iso
    .date()
    .refine((date) => date >= "2000-01-01" && date <= "2100-12-31")
    .safeParse(query.due);
  const time = z.iso.time({ precision: -1 }).safeParse(query.time);
  const [settings, contact, organization] = await Promise.all([
    getSettings(owner.id),
    contactId.success ? getContact(owner.id, contactId.data) : null,
    organizationId.success ? getOrganization(owner.id, organizationId.data) : null,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Add task</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewTask
          contact={contact}
          organization={organization}
          timezone={settings?.timezone ?? "UTC"}
          colors={priorityColors(settings)}
          due={due.success ? due.data : undefined}
          time={due.success && time.success ? time.data : undefined}
          cancelHref={
            contact
              ? contactHref(contact.id, "tasks")
              : organization
                ? companyHref(organization.id, "tasks")
                : due.success
                  ? `/tasks/calendar?view=${time.success ? "week" : "month"}&on=${due.data}`
                  : "/tasks"
          }
        />
      </CardContent>
    </Card>
  );
}
