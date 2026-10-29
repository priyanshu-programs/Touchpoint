import { z } from "zod";
import { getOwner } from "@/lib/session";
import { fromThisApp } from "@/lib/upload";
import {
  brainstormChangesQuery,
  brainstormElementsSave,
  MAX_SCENE_BYTES,
} from "@/modules/brainstorm/schema";
import { brainstormChanges, saveBrainstormElements } from "@/modules/brainstorm/service";

const refused = (status: number) => new Response(null, { status });

// What changed on the board after a clock, a page at a time: from clock 0, the
// whole board as it stands, asked for as the whiteboard opens.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/elements">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return refused(404);
  const query = brainstormChangesQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) return refused(400);

  const changes = await brainstormChanges(owner.id, id.data, query.data);
  if (!changes) return refused(404);
  return Response.json(changes, { headers: { "Cache-Control": "no-store" } });
}

// The elements one device changed since it last saved. A route and not a
// server action, so the bar across the top of the window does not flash every
// few seconds while the board is drawn on.
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/elements">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (!fromThisApp(request)) return refused(403);

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return refused(404);

  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_SCENE_BYTES) return refused(413);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return refused(400);
  }
  const save = brainstormElementsSave.safeParse(json);
  if (!save.success) return refused(400);

  const result = await saveBrainstormElements(owner.id, id.data, save.data);
  if (result.ok) return Response.json({ clock: result.clock, behind: result.behind });
  return refused({ not_found: 404, full: 413 }[result.reason]);
}
