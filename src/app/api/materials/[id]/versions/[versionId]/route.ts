import { z } from "zod";
import { getOwner } from "@/lib/session";
import { disposition, refused, upload } from "@/lib/upload";
import { getVersionFile } from "@/modules/materials/queries";
import { versionLabel, versionRef } from "@/modules/materials/schema";
import { replaceVersionFile } from "@/modules/materials/service";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/materials/[id]/versions/[versionId]">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const { id, versionId } = await params;
  const ref = versionRef.safeParse({ materialId: id, versionId });
  const file = ref.success ? await getVersionFile(owner.id, ref.data) : null;
  if (!file) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      // The kind was read from the bytes when the file was stored, never taken
      // from the upload.
      "Content-Type": file.contentType,
      "Content-Disposition": disposition(file.contentType, file.title ?? "file"),
      "Cache-Control": "private, no-store",
    },
  });
}

const replacement = z.strictObject({ ref: versionRef, label: versionLabel });

// A file put in place of what a version that was never sent held.
export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/materials/[id]/versions/[versionId]">,
) {
  const sent = await upload(request, ["label"]);
  if (sent instanceof Response) return sent;
  const { id, versionId } = await params;
  const parsed = replacement.safeParse({
    ref: { materialId: id, versionId },
    label: sent.values.label,
  });
  if (!parsed.success) return refused(400, "label");

  const result = await replaceVersionFile(sent.ownerId, parsed.data.ref, {
    label: parsed.data.label,
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return new Response(null, { status: 204 });
  return refused(
    {
      not_found: 404,
      sent: 409,
      too_large: 413,
      kind: 415,
      full: 507,
      rate: 429,
    }[result.reason],
    result.reason,
  );
}
