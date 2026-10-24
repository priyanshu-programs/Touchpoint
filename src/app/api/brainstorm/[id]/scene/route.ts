import { z } from "zod";
import { env } from "@/lib/env";
import { getOwner } from "@/lib/session";
import { getBrainstorm } from "@/modules/brainstorm/queries";
import { brainstormSceneSave, MAX_SCENE_BYTES } from "@/modules/brainstorm/schema";
import { saveBrainstormScene } from "@/modules/brainstorm/service";

const refused = (status: number) => new Response(null, { status });

// The drawing as it is stored now, asked for each time the whiteboard opens, as
// a workflow's is.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/scene">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);

  const id = z.uuid().safeParse((await params).id);
  const board = id.success ? await getBrainstorm(owner.id, id.data) : null;
  if (!board) return refused(404);

  return Response.json(
    { version: board.version, elements: board.scene.elements },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// A route and not a server action, so the bar across the top of the window does
// not flash every few seconds while the board is drawn on.
export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/scene">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (request.headers.get("origin") !== new URL(env.APP_URL).origin) {
    return refused(403);
  }

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
  const scene = brainstormSceneSave.safeParse(json);
  if (!scene.success) return refused(400);

  const result = await saveBrainstormScene(owner.id, id.data, scene.data);
  if (result.ok) return Response.json({ version: result.version });
  return refused({ not_found: 404, conflict: 409 }[result.reason]);
}
