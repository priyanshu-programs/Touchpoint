import { getOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { disposition, fromThisApp, refused } from "@/lib/upload";
import { startExport } from "@/modules/export/service";
import { exportFileName, exportZip } from "@/modules/export/stream";
import { ownerTimezone } from "@/modules/settings/service";
import { db } from "@/db/client";

// A large board can take a while to read; the zip is sent as it is written.
export const maxDuration = 300;

// Everything the owner keeps, as a zip. A POST from the Settings page's own form, so
// a link, a prefetch or another site can never start one.
export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (!fromThisApp(request)) return refused(403);

  const started = await startExport(owner.id);
  if (!started.ok) {
    return Response.redirect(new URL("/settings/export?refused=rate", request.url), 303);
  }

  const today = dateIn(await ownerTimezone(db, owner.id));
  return new Response(exportZip(owner.id), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disposition("application/zip", exportFileName(today)),
      "Cache-Control": "private, no-store",
    },
  });
}
