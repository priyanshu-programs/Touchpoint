import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { createMaterialAction } from "../actions";
import { materialTypeOptions } from "../labels";
import { MaterialForm } from "../material-form";

export const metadata: Metadata = { title: "New material" };

export default async function NewMaterialPage() {
  await requireOwner();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New material</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MaterialForm
          action={createMaterialAction}
          initial={{ name: "", type: "proposal", description: "", url: "", label: "" }}
          types={materialTypeOptions}
          firstVersion
          submitLabel="Create material"
          cancelHref="/materials"
        />
      </CardContent>
    </Card>
  );
}
