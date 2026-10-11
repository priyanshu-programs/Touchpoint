import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getOrganization } from "@/modules/organizations/queries";
import { ORGANIZATION_STATUSES } from "@/modules/organizations/schema";
import { toOptions } from "../../../labels";
import { updateOrganizationAction } from "../../actions";
import { OrganizationForm } from "../../organization-form";

export const metadata: Metadata = { title: "Edit company" };

export default async function EditOrganizationPage({
  params,
}: PageProps<"/people/organizations/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const organization = await getOrganization(owner.id, id.data);
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
            industry: organization.industry ?? "",
            city: organization.city ?? "",
            region: organization.region ?? "",
            country: organization.country ?? "",
            description: organization.description ?? "",
            tags: organization.tags.join(", "),
          }}
          statuses={toOptions(ORGANIZATION_STATUSES)}
          submitLabel="Save changes"
          cancelHref={`/people/organizations/${organization.id}`}
        />
      </CardContent>
    </Card>
  );
}
