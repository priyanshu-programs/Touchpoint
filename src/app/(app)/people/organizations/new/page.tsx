import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { listCustomFields } from "@/modules/fields/queries";
import { listCompanyStatuses } from "@/modules/statuses/queries";
import {
  customFormFields,
  customFormValues,
} from "../../fields/custom-values";
import { createOrganizationAction } from "../actions";
import { OrganizationForm } from "../organization-form";

export const metadata: Metadata = { title: "Add company" };

export default async function NewOrganizationPage() {
  const owner = await requireOwner();
  const [statuses, customFields] = await Promise.all([
    listCompanyStatuses(owner.id),
    listCustomFields(owner.id, "organization"),
  ]);

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
            ...customFormValues(customFields, {}),
          }}
          statuses={statuses.map(({ key, label }) => ({ value: key, label }))}
          customFields={customFormFields(customFields)}
          submitLabel="Add company"
          cancelHref="/people/organizations"
        />
      </CardContent>
    </Card>
  );
}
