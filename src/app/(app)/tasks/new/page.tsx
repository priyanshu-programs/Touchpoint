import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { companyHref } from "@/app/(app)/people/labels";
import { getContact } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { createTaskAction } from "../actions";
import { taskFormOptions } from "../form-options";
import { TaskForm } from "../task-form";

export const metadata: Metadata = { title: "Add task" };

export default async function NewTaskPage({
  searchParams,
}: PageProps<"/tasks/new">) {
  const owner = await requireOwner();
  const query = await searchParams;
  const contactId = z.uuid().safeParse(query.contact);
  const organizationId = z.uuid().safeParse(query.organization);
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
        <TaskForm
          action={createTaskAction}
          initial={{
            title: "",
            notes: "",
            priority: "normal",
            dueDate: "",
            dueTime: "",
            repeat: "",
            repeatEvery: "1",
            remindAt: "",
            contactId: contact?.id ?? "",
            contactName: contact?.fullName ?? "",
            // A task for a person is also about their organization.
            organizationId: organization?.id ?? contact?.organizationId ?? "",
            organizationName:
              organization?.name ?? contact?.organizationName ?? "",
          }}
          options={taskFormOptions}
          timezone={settings?.timezone ?? "UTC"}
          from={contact ? "contact" : organization ? "organization" : undefined}
          submitLabel="Add task"
          cancelHref={
            contact
              ? `/people/contacts/${contact.id}/tasks`
              : organization
                ? companyHref(organization.id, "tasks")
                : "/tasks"
          }
        />
      </CardContent>
    </Card>
  );
}
