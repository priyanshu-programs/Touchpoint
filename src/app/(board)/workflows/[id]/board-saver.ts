export type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

const QUIET_MS = 2_000;
const RETRY_MS = 10_000;
// A browser sends a request that outlives its page only if the body is small.
const KEEPALIVE_BYTES = 60_000;

// Saves a drawing a little after the last change to it, one save at a time, each
// from the version the one before gave back. `hash` tells one state of the
// drawing from another without comparing every element.
export function createBoardSaver<Element>({
  boardId,
  version,
  hash,
  report,
}: {
  boardId: string;
  version: number;
  hash: (elements: readonly Element[]) => number;
  report: (state: SaveState) => void;
}) {
  let seen: number | null = null;
  let waiting: readonly Element[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let stopped = false;

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void send(false), ms);
  };

  async function send(leaving: boolean) {
    clearTimeout(timer);
    if (busy || stopped || !waiting) return;
    const elements = waiting;
    waiting = null;
    busy = true;
    report("saving");

    const body = JSON.stringify({ version, elements });
    const response = await fetch(`/api/workflows/${boardId}/scene`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: leaving && body.length < KEEPALIVE_BYTES,
    }).catch(() => null);
    busy = false;

    if (response?.ok) {
      ({ version } = (await response.json()) as { version: number });
      report(waiting ? "unsaved" : "saved");
      if (waiting) later(QUIET_MS);
    } else if (response?.status === 409) {
      // The drawing was saved from somewhere else since this one opened.
      // Saving over it would lose that, so this whiteboard stops saving.
      stopped = true;
      report("conflict");
    } else {
      waiting ??= elements;
      report("error");
      later(RETRY_MS);
    }
  }

  return {
    // Called with the whole drawing whenever the whiteboard redraws.
    changed(elements: readonly Element[]) {
      const now = hash(elements);
      // The first call is the drawing as it was opened.
      if (seen === null) seen = now;
      if (now === seen || stopped) return;
      seen = now;
      waiting = elements;
      report("unsaved");
      later(QUIET_MS);
    },
    // Saves at once what is waiting: the page is being hidden or left.
    flush: () => void send(true),
  };
}
