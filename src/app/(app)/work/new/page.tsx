import type { Metadata } from "next";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getOrganization } from "@/modules/organizations/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { getSettings } from "@/modules/settings/service";
import { companyHref } from "../../people/labels";
import { createEngagementAction } from "../actions";
import { EngagementForm } from "../engagement-form";
import { engagementStatusOptions } from "../labels";

export const metadata: Metadata = { title: "New engagement" };

export default async function NewEngagementPage({
  searchParams,
}: PageProps<"/work/new">) {
  const owner = await requireOwner();
  const company = z.uuid().safeParse((await searchParams).company);
  const [organization, settings] = await Promise.all([
    company.success ? getOrganization(owner.id, company.data) : null,
    getSettings(owner.id),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New engagement</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EngagementForm
          action={createEngagementAction}
          initial={{
            organizationId: organization?.id ?? "",
            organizationName: organization?.name ?? "",
            title: "",
            status: "planned",
            currency: settings?.baseCurrency ?? "INR",
            value: "",
            paymentTerms: "",
            startDate: "",
            targetEndDate: "",
            scope: "",
            objectives: "",
          }}
          statuses={engagementStatusOptions}
          currencies={CURRENCIES}
          submitLabel="Create engagement"
          cancelHref={
            organization ? companyHref(organization.id, "engagements") : "/work"
          }
        />
      </CardContent>
    </Card>
  );
}
