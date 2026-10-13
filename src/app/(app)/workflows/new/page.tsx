import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { createBoardAction } from "../actions";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New workflow" };

export default async function NewWorkflowPage() {
  await requireOwner();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New workflow</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TemplateForm
          action={createBoardAction}
          initial={{ name: "", description: "" }}
          submitLabel="Create workflow"
        />
      </CardContent>
    </Card>
  );
}
