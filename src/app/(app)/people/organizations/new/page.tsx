import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { ORGANIZATION_STATUSES } from "@/modules/organizations/schema";
import { toOptions } from "../../labels";
import { createOrganizationAction } from "../actions";
import { OrganizationForm } from "../organization-form";

export const metadata: Metadata = { title: "Add organization" };

export default async function NewOrganizationPage() {
  await requireOwner();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Add organization</h1>
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
            industry: "",
            city: "",
            region: "",
            country: "",
            description: "",
            tags: "",
          }}
          statuses={toOptions(ORGANIZATION_STATUSES)}
          submitLabel="Add organization"
          cancelHref="/people/organizations"
        />
      </CardContent>
    </Card>
  );
}
