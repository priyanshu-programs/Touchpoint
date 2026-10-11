import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { companyHref } from "@/app/(app)/people/labels";
import { toLocalInput } from "@/lib/time";
import { getContact } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { getSettings } from "@/modules/settings/service";
import { logActivityAction } from "../actions";
import { ActivityForm } from "../activity-form";
import { activityFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Log activity" };

export default async function NewActivityPage({
  searchParams,
}: PageProps<"/activities/new">) {
  const owner = await requireOwner();
  const query = await searchParams;
  const contactId = z.uuid().safeParse(query.contact);
  const organizationId = z.uuid().safeParse(query.organization);
  const [settings, contact, organization] = await Promise.all([
    getSettings(owner.id),
    contactId.success ? getContact(owner.id, contactId.data) : null,
    organizationId.success ? getOrganization(owner.id, organizationId.data) : null,
  ]);
  const timezone = settings?.timezone ?? "UTC";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Log activity</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
            // What happened with a person is also part of their organization's history.
            organizationId: organization?.id ?? contact?.organizationId ?? "",
            organizationName:
              organization?.name ?? contact?.organizationName ?? "",
            followUpDate: "",
            followUpTitle: "",
          }}
          options={activityFormOptions}
          timezone={timezone}
          from={contact ? "contact" : organization ? "organization" : undefined}
          followUp
          submitLabel="Log activity"
          cancelHref={
            contact
              ? `/people/contacts/${contact.id}/timeline`
              : organization
                ? companyHref(organization.id, "activity")
                : "/people/contacts"
          }
        />
      </CardContent>
    </Card>
  );
}
