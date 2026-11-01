import { z } from "zod";
import { getOwner } from "@/lib/session";
import { fromThisApp } from "@/lib/upload";
import { liveRoomPass } from "@/modules/brainstorm/live";
import { getBrainstorm } from "@/modules/brainstorm/queries";

const refused = (status: number) => new Response(null, { status });

// What the owner's device needs to join a board's live room. No content means
// this instance has no room, and the board keeps in step by asking the server.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/brainstorm/[id]/live">,
) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (!fromThisApp(request)) return refused(403);

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return refused(404);
  if (!(await getBrainstorm(owner.id, id.data))) return refused(404);

  const pass = liveRoomPass(id.data);
  if (!pass) return refused(204);
  return Response.json(pass, { headers: { "Cache-Control": "no-store" } });
}
