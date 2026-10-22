import { z } from "zod";
import { refused, upload } from "@/lib/upload";
import { versionLabel } from "@/modules/materials/schema";
import { addVersionFile } from "@/modules/materials/service";

const versionFile = z.strictObject({ materialId: z.uuid(), label: versionLabel });

// A file added to a material as a new version.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/materials/[id]/versions">,
) {
  const sent = await upload(request, ["label"]);
  if (sent instanceof Response) return sent;
  const version = versionFile.safeParse({
    materialId: (await params).id,
    label: sent.values.label,
  });
  if (!version.success) return refused(400, "label");

  const result = await addVersionFile(sent.ownerId, version.data.materialId, {
    label: version.data.label,
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return Response.json({ id: result.id });
  return refused(
    {
      not_found: 404,
      limit: 409,
      too_large: 413,
      kind: 415,
      full: 507,
      rate: 429,
    }[result.reason],
    result.reason,
  );
}
