import { getOwner } from "@/lib/session";
import { SHOWN_INLINE } from "@/modules/files/sniff";
import { getAttachmentFile } from "@/modules/workflows/attachments";
import { attachmentRef } from "@/modules/workflows/schema";

// The name a browser saves the file under, in the one form that carries any
// character safely in a header.
const named = (title: string) =>
  encodeURIComponent(title).replace(
    /['()*]/g,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`,
  );

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
      // from the upload. A PDF or a picture opens in the tab; the rest is saved.
      "Content-Type": file.contentType,
      "Content-Disposition": `${
        SHOWN_INLINE.has(file.contentType) ? "inline" : "attachment"
      }; filename*=UTF-8''${named(file.title)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
