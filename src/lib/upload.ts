import { env } from "@/lib/env";
import { getOwner } from "@/lib/session";
import { SHOWN_INLINE } from "@/modules/files/sniff";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";

// A form's own lines around the file it carries.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 100_000;

// How a stored file is handed over: a PDF or a picture opens in the tab, the
// rest is saved, under its title in the one form that carries any character
// safely in a header.
export const disposition = (contentType: string, title: string) =>
  `${SHOWN_INLINE.has(contentType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(
    title,
  ).replace(
    /['()*]/g,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;

export const refused = (status: number, reason?: string) =>
  reason ? Response.json({ reason }, { status }) : new Response(null, { status });

// What an upload brings: the signed-in owner, the file, and
// the one other field its form may have. The answer to give instead when the
// request is turned away. An upload is a route and not a server action because
// a server action takes a megabyte at most.
export async function upload(request: Request, field: string) {
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
  if (
    !(file instanceof File) ||
    [...form.keys()].some((key) => key !== "file" && key !== field)
  ) {
    return refused(400);
  }
  return { ownerId: owner.id, file, value: form.get(field) };
}
