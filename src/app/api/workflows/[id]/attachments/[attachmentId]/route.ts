import { getOwner } from "@/lib/session";
import { disposition } from "@/lib/upload";
import { getAttachmentFile } from "@/modules/workflows/attachments";
import { attachmentRef } from "@/modules/workflows/schema";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/workflows/[id]/attachments/[attachmentId]">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const { id, attachmentId } = await params;
  const ref = attachmentRef.safeParse({ boardId: id, attachmentId });
  const file = ref.success ? await getAttachmentFile(owner.id, ref.data) : null;
  if (!file) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      // The kind was read from the bytes when the file was stored, never taken
      // from the upload.
      "Content-Type": file.contentType,
      "Content-Disposition": disposition(file.contentType, file.title),
      "Cache-Control": "private, no-store",
    },
  });
}
