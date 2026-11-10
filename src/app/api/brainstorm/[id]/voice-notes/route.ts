import { z } from "zod";
import { getOwner } from "@/lib/session";
import { disposition, refused, upload } from "@/lib/upload";
import { voiceRef } from "@/modules/brainstorm/voice";
import { addVoiceNote, zipVoiceNotes } from "@/modules/brainstorm/voice-notes";

// A voice note recorded on a brainstorm board, sent under its card's own id for it.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/voice-notes">,
) {
  const sent = await upload(request, ["key"]);
  if (sent instanceof Response) return sent;
  const note = voiceRef.safeParse({ boardId: (await params).id, key: sent.values.key });
  if (!note.success) return refused(400);

  const result = await addVoiceNote(
    sent.ownerId,
    note.data,
    Buffer.from(await sent.file.arrayBuffer()),
  );
  if (result.ok) return new Response(null, { status: 204 });
  return refused(
    { not_found: 404, limit: 409, too_large: 413, kind: 415, full: 507, rate: 429 }[
      result.reason
    ],
    result.reason,
  );
}

// Every voice note on the board, in one zip.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/voice-notes">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  const zip = id.success ? await zipVoiceNotes(owner.id, id.data) : null;
  if (!zip) return new Response(null, { status: 404 });

  return new Response(zip.bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disposition("application/zip", zip.name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
