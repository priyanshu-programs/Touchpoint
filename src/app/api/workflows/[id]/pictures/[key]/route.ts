import { getOwner } from "@/lib/session";
import { getPicture } from "@/modules/workflows/pictures";
import { pictureRef } from "@/modules/workflows/schema";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/workflows/[id]/pictures/[key]">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const { id, key } = await params;
  const ref = pictureRef.safeParse({ boardId: id, key });
  const picture = ref.success ? await getPicture(owner.id, ref.data) : null;
  if (!picture) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(picture.bytes), {
    headers: {
      "Content-Type": picture.contentType,
      // A board's picture under one id is stored once and never changed.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
