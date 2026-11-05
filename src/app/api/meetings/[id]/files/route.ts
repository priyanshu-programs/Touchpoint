import { z } from "zod";
import { refused, upload } from "@/lib/upload";
import { addMeetingFile } from "@/modules/activities/meeting-notes";

// A file uploaded into a meeting's notes.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/meetings/[id]/files">,
) {
  const sent = await upload(request, []);
  if (sent instanceof Response) return sent;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return refused(404);

  const result = await addMeetingFile(sent.ownerId, id.data, {
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return new Response(null, { status: 204 });
  return refused(
    { not_found: 404, too_large: 413, kind: 415, full: 507, rate: 429, limit: 409 }[
      result.reason
    ],
    result.reason,
  );
}
