import { z } from "zod";
import { getOwner } from "@/lib/session";
import { getLogo } from "@/modules/enrichment/queries";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/organizations/[id]/logo">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const id = z.uuid().safeParse((await params).id);
  const logo = id.success ? await getLogo(owner.id, id.data) : null;
  if (!logo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      // The type was read from the bytes when the logo was stored, never taken from the site.
      "Content-Type": logo.contentType,
      // The address carries the logo's hash, so a new logo gets a new address.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
