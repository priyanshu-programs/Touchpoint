import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { listCompanyStatuses } from "@/modules/statuses/queries";
import { createOrganizationAction } from "../actions";
import { OrganizationForm } from "../organization-form";

export const metadata: Metadata = { title: "Add company" };

export default async function NewOrganizationPage() {
  const owner = await requireOwner();
  const statuses = await listCompanyStatuses(owner.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Add company</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrganizationForm
          action={createOrganizationAction}
          initial={{
            name: "",
            status: "prospect",
            domain: "",
            website: "",
            phone: "",
            email: "",
            industry: "",
            city: "",
            region: "",
            country: "",
            description: "",
            tags: "",
          }}
          statuses={statuses.map(({ key, label }) => ({ value: key, label }))}
          submitLabel="Add company"
          cancelHref="/people/organizations"
        />
      </CardContent>
    </Card>
  );
}
