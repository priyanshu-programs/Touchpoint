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

// A server action checks where a request came from by itself; a route that changes
// data, or reads all of it, has to.
export const fromThisApp = (request: Request) =>
  request.headers.get("origin") === new URL(env.APP_URL).origin;

export const refused = (status: number, reason?: string) =>
  reason ? Response.json({ reason }, { status }) : new Response(null, { status });

// What an upload brings: the signed-in owner, the file, and the other fields
// its form may have, each as text (a field left out is ""). The answer to give
// instead when the request is turned away. An upload is a route and not a
// server action because a server action takes a megabyte at most.
export async function upload<const F extends string>(request: Request, fields: readonly F[]) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (!fromThisApp(request)) return refused(403);

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
  const allowed = new Set<string>(["file", ...fields]);
  if (
    !(file instanceof File) ||
    [...form.keys()].some((key) => !allowed.has(key)) ||
    fields.some((field) => form.getAll(field).length > 1 || form.get(field) instanceof File)
  ) {
    return refused(400);
  }
  const values = Object.fromEntries(
    fields.map((field) => [field, String(form.get(field) ?? "")]),
  ) as Record<F, string>;
  return { ownerId: owner.id, file, values };
}
