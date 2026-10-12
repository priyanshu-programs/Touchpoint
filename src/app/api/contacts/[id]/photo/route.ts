import { z } from "zod";
import { getOwner } from "@/lib/session";
import { getPhoto } from "@/modules/enrichment/queries";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/contacts/[id]/photo">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const id = z.uuid().safeParse((await params).id);
  const photo = id.success ? await getPhoto(owner.id, id.data) : null;
  if (!photo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      // The type was read from the bytes when the picture was stored, never taken from the site.
      "Content-Type": photo.contentType,
      // The address carries the picture's hash, so a new picture gets a new address.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
