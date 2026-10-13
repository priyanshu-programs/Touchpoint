import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { listCustomFields } from "@/modules/fields/queries";
import { getOrganization } from "@/modules/organizations/queries";
import { listCompanyStatuses } from "@/modules/statuses/queries";
import {
  customFormFields,
  customFormValues,
} from "../../../fields/custom-values";
import { companyHref } from "../../../labels";
import { updateOrganizationAction } from "../../actions";
import { OrganizationForm } from "../../organization-form";

export const metadata: Metadata = { title: "Edit company" };

export default async function EditOrganizationPage({
  params,
}: PageProps<"/people/organizations/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [organization, customFields, statuses] = await Promise.all([
    getOrganization(owner.id, id.data),
    listCustomFields(owner.id, "organization"),
    listCompanyStatuses(owner.id),
  ]);
  if (!organization) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit {organization.name}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrganizationForm
          action={updateOrganizationAction.bind(null, organization.id)}
          initial={{
            name: organization.name,
            status: organization.status,
            domain: organization.domain ?? "",
            website: organization.website ?? "",
            phone: organization.phone ?? "",
            email: organization.email ?? "",
            industry: organization.industry ?? "",
            city: organization.city ?? "",
            region: organization.region ?? "",
            country: organization.country ?? "",
            description: organization.description ?? "",
            tags: organization.tags.join(", "),
            ...customFormValues(customFields, organization.custom),
          }}
          statuses={statuses.map(({ key, label }) => ({ value: key, label }))}
          customFields={customFormFields(customFields)}
          submitLabel="Save changes"
          cancelHref={companyHref(organization.id)}
        />
      </CardContent>
    </Card>
  );
}
