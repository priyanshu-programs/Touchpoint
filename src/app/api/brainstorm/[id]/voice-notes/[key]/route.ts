import { getOwner } from "@/lib/session";
import { voiceRef } from "@/modules/brainstorm/voice";
import { getVoiceNote } from "@/modules/brainstorm/voice-notes";

// The part of the file a `Range: bytes=…` header asks for, or null for all of it.
// Safari plays a recording only from a server that answers such requests.
function rangeOf(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  const [start, end] = match[1]
    ? [Number(match[1]), match[2] ? Math.min(Number(match[2]), size - 1) : size - 1]
    : [Math.max(0, size - Number(match[2])), size - 1];
  return start <= end && start < size ? { start, end } : "unsatisfiable";
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/voice-notes/[key]">,
) {
  const owner = await getOwner();
  if (!owner) return new Response(null, { status: 401 });

  const { id, key } = await params;
  const ref = voiceRef.safeParse({ boardId: id, key });
  const note = ref.success ? await getVoiceNote(owner.id, ref.data) : null;
  if (!note) return new Response(null, { status: 404 });

  const size = note.bytes.length;
  const headers = {
    "Content-Type": note.contentType,
    "Accept-Ranges": "bytes",
    // A board's recording under one id is stored once and never changed.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  const range = rangeOf(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    return new Response(new Uint8Array(note.bytes.subarray(range.start, range.end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
    });
  }
  return new Response(new Uint8Array(note.bytes), { headers });
}
