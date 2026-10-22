import { addPicture } from "@/modules/workflows/pictures";
import { pictureRef } from "@/modules/workflows/schema";
import { refused, upload } from "@/lib/upload";

// A picture drawn on a whiteboard, sent under the whiteboard's own id for it.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/workflows/[id]/pictures">,
) {
  const sent = await upload(request, ["key"]);
  if (sent instanceof Response) return sent;
  const picture = pictureRef.safeParse({
    boardId: (await params).id,
    key: sent.values.key,
  });
  if (!picture.success) return refused(400);

  const result = await addPicture(
    sent.ownerId,
    picture.data,
    Buffer.from(await sent.file.arrayBuffer()),
  );
  if (result.ok) return new Response(null, { status: 204 });
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
