import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { minorToInput } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getEngagement } from "@/modules/engagements/queries";
import { CURRENCIES } from "@/modules/settings/schema";
import { updateEngagementAction } from "../../actions";
import { EngagementForm } from "../../engagement-form";
import { engagementHref, engagementStatusOptions } from "../../labels";

export const metadata: Metadata = { title: "Edit engagement" };

export default async function EditEngagementPage({
  params,
}: PageProps<"/work/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const engagement = await getEngagement(owner.id, id.data);
  if (!engagement) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit {engagement.title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EngagementForm
          action={updateEngagementAction.bind(null, engagement.id)}
          initial={{
            organizationId: engagement.organizationId,
            organizationName: engagement.organizationName,
            title: engagement.title,
            status: engagement.status,
            currency: engagement.currency,
            value:
              engagement.valueMinor === null
                ? ""
                : minorToInput(engagement.valueMinor, engagement.currency),
            paymentTerms: engagement.paymentTerms ?? "",
            startDate: engagement.startDate ?? "",
            targetEndDate: engagement.targetEndDate ?? "",
            scope: engagement.scope ?? "",
            objectives: engagement.objectives ?? "",
          }}
          statuses={engagementStatusOptions}
          currencies={CURRENCIES}
          submitLabel="Save changes"
          cancelHref={engagementHref(engagement.id)}
        />
      </CardContent>
    </Card>
  );
}
