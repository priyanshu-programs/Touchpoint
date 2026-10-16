import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getMaterial } from "@/modules/materials/queries";
import { updateMaterialAction } from "../../actions";
import { materialHref, materialTypeOptions } from "../../labels";
import { MaterialForm } from "../../material-form";

export const metadata: Metadata = { title: "Edit material" };

export default async function EditMaterialPage({
  params,
}: PageProps<"/materials/[id]/edit">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const material = await getMaterial(owner.id, id.data);
  if (!material) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Edit {material.name}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MaterialForm
          action={updateMaterialAction.bind(null, material.id)}
          initial={{
            name: material.name,
            type: material.type,
            description: material.description ?? "",
          }}
          types={materialTypeOptions}
          submitLabel="Save changes"
          cancelHref={materialHref(material.id)}
        />
      </CardContent>
    </Card>
  );
}
