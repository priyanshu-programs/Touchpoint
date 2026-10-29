import { z } from "zod";
import { getOwner } from "@/lib/session";
import { fromThisApp } from "@/lib/upload";
import { saveScene } from "@/modules/workflows/boards";
import { getBoard } from "@/modules/workflows/queries";
import { MAX_SCENE_BYTES, sceneSave } from "@/modules/workflows/schema";

const refused = (status: number) => new Response(null, { status });

// The drawing as it is stored now. The whiteboard asks for it each time it
// opens, because a page the browser kept (Back, say) would otherwise show an
// old drawing and then have its saves refused.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/workflows/[id]/scene">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);

  const id = z.uuid().safeParse((await params).id);
  const board = id.success ? await getBoard(owner.id, id.data) : null;
  if (!board) return refused(404);

  return Response.json(
    { version: board.version, elements: board.scene.elements },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// The whiteboard saves itself here every few seconds while it is drawn on. It is
// a route and not a server action so that the bar across the top of the window,
// which shows for every server action, does not flash the whole time.
export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/workflows/[id]/scene">,
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
  const scene = sceneSave.safeParse(json);
  if (!scene.success) return refused(400);

  const result = await saveScene(owner.id, id.data, scene.data);
  if (result.ok) return Response.json({ version: result.version });
  return refused(
    { not_found: 404, conflict: 409, stage_limit: 400 }[result.reason],
  );
}
