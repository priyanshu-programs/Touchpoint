import { addFile } from "@/modules/workflows/attachments";
import { boxRef } from "@/modules/workflows/schema";
import { refused, upload } from "../upload";

// A file put on a box of a whiteboard.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/workflows/[id]/attachments">,
) {
  const sent = await upload(request, "elementId");
  if (sent instanceof Response) return sent;
  const box = boxRef.safeParse({
    boardId: (await params).id,
    elementId: sent.value,
  });
  if (!box.success) return refused(400);

  const result = await addFile(sent.ownerId, box.data, {
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return Response.json({ attachments: result.attachments });
  return refused(
    {
      not_found: 404,
      no_box: 409,
      limit: 409,
      too_large: 413,
      kind: 415,
      full: 507,
      rate: 429,
    }[result.reason],
    result.reason,
  );
}
