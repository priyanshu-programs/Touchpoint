import { env } from "@/lib/env";
import { getOwner } from "@/lib/session";
import { addFile } from "@/modules/workflows/attachments";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { boxRef } from "@/modules/workflows/schema";

// A form's own lines around the file it carries.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 100_000;

const refused = (status: number, reason?: string) =>
  reason ? Response.json({ reason }, { status }) : new Response(null, { status });

// A file put on a box of a whiteboard. It is a route and not a server action
// because a server action takes a megabyte at most.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/workflows/[id]/attachments">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  // A server action checks where a request came from by itself; a route has to.
  if (request.headers.get("origin") !== new URL(env.APP_URL).origin) {
    return refused(403);
  }

  // Turned away by its stated size, before any of it is read.
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) return refused(411);
  if (length > MAX_BODY_BYTES) return refused(413, "too_large");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refused(400);
  }
  const file = form.get("file");
  const box = boxRef.safeParse({
    boardId: (await params).id,
    elementId: form.get("elementId"),
  });
  if (
    !box.success ||
    !(file instanceof File) ||
    [...form.keys()].some((key) => key !== "file" && key !== "elementId")
  ) {
    return refused(400);
  }

  const result = await addFile(owner.id, box.data, {
    name: file.name,
    bytes: Buffer.from(await file.arrayBuffer()),
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
