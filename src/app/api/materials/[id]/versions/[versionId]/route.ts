import { getOwner } from "@/lib/session";
import { disposition } from "@/lib/upload";
import { getVersionFile } from "@/modules/materials/queries";
import { versionRef } from "@/modules/materials/schema";

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
