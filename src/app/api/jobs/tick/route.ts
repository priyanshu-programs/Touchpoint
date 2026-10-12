import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { tick } from "@/modules/jobs/tick";

// A website read that waits on a drawn page can take 20 seconds after the last job starts.
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // cron-job.org gives up after 30 seconds, so stop well before that.
  return Response.json(await tick(20_000));
}

// Vercel Cron can only send GET; external schedulers use POST.
export { handle as GET, handle as POST };
