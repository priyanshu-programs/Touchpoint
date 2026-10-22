import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { requireOwner } from "@/lib/session";
import { dateIn, formatDate } from "@/lib/time";
import { getMaterial } from "@/modules/materials/queries";
import { MATERIAL_TYPE_LABELS } from "@/modules/materials/schema";
import { getSettings } from "@/modules/settings/service";
import { RecordActions } from "../../people/(lists)/record-actions";
import { deleteMaterialAction } from "../actions";
import { VersionsCard } from "./versions-card";

const parseId = async (params: PageProps<"/materials/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

export async function generateMetadata({
  params,
}: PageProps<"/materials/[id]">): Promise<Metadata> {
  const owner = await requireOwner();
  const id = await parseId(params);
  const material = id.success ? await getMaterial(owner.id, id.data) : null;
  return { title: material?.name ?? "Material" };
}

export default async function MaterialPage({ params }: PageProps<"/materials/[id]">) {
  const owner = await requireOwner();
  const id = await parseId(params);
  if (!id.success) notFound();
  const [material, settings] = await Promise.all([
    getMaterial(owner.id, id.data),
    getSettings(owner.id),
  ]);
  if (!material) notFound();
  const timezone = settings?.timezone ?? "UTC";

  return (
    <div className="grid gap-6">
      <Link
        href="/materials"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Materials
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {material.name}
          </h1>
          <div>
            <Badge variant="secondary">{MATERIAL_TYPE_LABELS[material.type]}</Badge>
          </div>
          {material.description ? (
            <p className="max-w-prose break-words whitespace-pre-wrap">
              {material.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </div>
        <RecordActions
          id={material.id}
          editHref={`/materials/${material.id}/edit`}
          remove={{
            title: `Delete ${material.name}?`,
            description:
              "The material and every version of it are removed for good, with any file uploaded for it that nothing else uses. Its sends go with it, from every Activity tab they show on.",
            confirmLabel: "Delete material",
            action: deleteMaterialAction,
          }}
        />
      </header>

      <VersionsCard
        materialId={material.id}
        versions={material.versions.map(({ createdAt, ...version }) => ({
          ...version,
          added: formatDate(dateIn(timezone, createdAt)),
        }))}
      />
    </div>
  );
}
