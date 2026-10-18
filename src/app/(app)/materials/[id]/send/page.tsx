import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getMaterial } from "@/modules/materials/queries";
import { getSettings } from "@/modules/settings/service";
import { materialHref } from "../../labels";
import { NewSend } from "../../new-send";

export const metadata: Metadata = { title: "Log a send" };

export default async function LogSendPage({ params }: PageProps<"/materials/[id]/send">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [material, settings] = await Promise.all([
    getMaterial(owner.id, id.data),
    getSettings(owner.id),
  ]);
  if (!material) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Log a send of {material.name}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewSend
          ownerId={owner.id}
          materialId={material.id}
          contact={null}
          organization={null}
          timezone={settings?.timezone ?? "UTC"}
          cancelHref={materialHref(material.id)}
        />
      </CardContent>
    </Card>
  );
}
