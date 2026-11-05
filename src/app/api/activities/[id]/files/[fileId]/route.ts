import { z } from "zod";
import { getOwner } from "@/lib/session";
import { disposition } from "@/lib/upload";
import { getActivityFile } from "@/modules/activities/meeting-notes";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/activities/[id]/files/[fileId]">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const ids = z.strictObject({ id: z.uuid(), fileId: z.uuid() }).safeParse(await params);
  const file = ids.success
    ? await getActivityFile(owner.id, ids.data.id, ids.data.fileId)
    : null;
  if (!file) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      // The kind was read from the bytes when the file was stored, never taken from the upload.
      "Content-Type": file.contentType,
      "Content-Disposition": disposition(file.contentType, file.title),
      "Cache-Control": "private, no-store",
    },
  });
}
