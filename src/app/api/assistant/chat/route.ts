import { getOwner } from "@/lib/session";
import { fromThisApp, refused } from "@/lib/upload";
import { beginChat, reply, type ChatRefusal } from "@/modules/assistant/chat";
import { chatInput } from "@/modules/assistant/schema";

// A free model can take a while to start answering.
export const maxDuration = 120;

// A message is at most 4,000 characters, each up to four bytes, in a small envelope.
const MAX_BODY_BYTES = 20_000;

const STATUS: Record<ChatRefusal, number> = {
  no_key: 409,
  unreadable: 409,
  not_found: 404,
  rate: 429,
  too_many_chats: 409,
  chat_full: 409,
};

// The owner's message in, the model's answer out as it is written: one JSON event a
// line. A route because a server action can't stream.
export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return refused(401);
  if (!fromThisApp(request)) return refused(403);

  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) return refused(411);
  if (length > MAX_BODY_BYTES) return refused(413);
  const input = chatInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return refused(400);

  const begun = await beginChat(owner, input.data);
  if (!begun.ok) return refused(STATUS[begun.reason], begun.reason);

  const stopped = new AbortController();
  const events = reply(begun.turn, stopped.signal);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    // The panel was closed or the page left: stop the model and keep what arrived.
    async cancel() {
      stopped.abort();
      await events.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
