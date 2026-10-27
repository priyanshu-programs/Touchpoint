import { z } from "zod";
import { getOwner } from "@/lib/session";
import { disposition, refused, upload } from "@/lib/upload";
import { getInvoiceFile } from "@/modules/invoices/queries";
import { attachInvoiceFile } from "@/modules/invoices/service";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/invoices/[id]/file">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const id = z.uuid().safeParse((await params).id);
  const file = id.success ? await getInvoiceFile(owner.id, id.data) : null;
  if (!file) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      // The kind was read from the bytes when the file was stored, never taken
      // from the upload.
      "Content-Type": file.contentType,
      "Content-Disposition": disposition(file.contentType, file.fileName ?? "invoice"),
      "Cache-Control": "private, no-store",
    },
  });
}

// The invoice exported from Figma, attached to its record or put in place of the one before.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/invoices/[id]/file">,
) {
  const sent = await upload(request, []);
  if (sent instanceof Response) return sent;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return refused(404);

  const result = await attachInvoiceFile(sent.ownerId, id.data, {
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return new Response(null, { status: 204 });
  return refused(
    { not_found: 404, too_large: 413, kind: 415, full: 507, rate: 429 }[result.reason],
    result.reason,
  );
}
