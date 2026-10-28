export type SaveState =
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "conflict"
  | "full";

const QUIET_MS = 2_000;
const RETRY_MS = 10_000;
// A browser sends a request that outlives its page only if the body is small.
const KEEPALIVE_BYTES = 60_000;

const round = (n: number) => Math.round(n * 100) / 100;

// A pen stroke is kept as every point it passed through, each to 17 digits:
// most of a drawing's bytes, and of the room it has to be stored in. A
// hundredth of a pixel is as fine as anyone can see.
function trimmed(key: string, value: unknown) {
  if (key === "points" && Array.isArray(value)) {
    return value.map(([x, y]: [number, number]) => [round(x), round(y)]);
  }
  if (key === "pressures" && Array.isArray(value)) {
    return value.map(round);
  }
  return value;
}

// Saves a drawing a little after the last change to it, one save at a time, each
// from the version the one before gave back. `hash` tells one state of the
// drawing from another without comparing every element.
export function createBoardSaver<Element>({
  endpoint,
  version,
  hash,
  report,
}: {
  // Where the drawing is put: a workflow's or a brainstorm board's scene route.
  endpoint: string;
  version: number;
  hash: (elements: readonly Element[]) => number;
  report: (state: SaveState) => void;
}) {
  let seen: number | null = null;
  let waiting: readonly Element[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let stopped = false;
  // How the save last begun ends: whether the drawing it sent is stored.
  let last = Promise.resolve(true);

  const start = (leaving: boolean) => {
    if (!busy) last = send(leaving);
    return last;
  };

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void start(false), ms);
  };

  async function send(leaving: boolean) {
    clearTimeout(timer);
    if (stopped || !waiting) return !stopped;
    const elements = waiting;
    waiting = null;
    busy = true;
    report("saving");

    const body = JSON.stringify({ version, elements }, trimmed);
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: leaving && body.length < KEEPALIVE_BYTES,
    }).catch(() => null);
    // The next save starts from the version this one gave back, so nothing
    // may begin one until that is known.
    const saved = response?.ok
      ? ((await response.json()) as { version: number })
      : null;
    busy = false;

    if (saved) {
      ({ version } = saved);
      report(waiting ? "unsaved" : "saved");
      if (waiting) later(QUIET_MS);
      return true;
    }
    if (response?.status === 409) {
      // The drawing was saved from somewhere else since this one opened.
      // Saving over it would lose that, so this whiteboard stops saving.
      stopped = true;
      report("conflict");
    } else if (response?.status === 413) {
      // The drawing is bigger than a board can hold. Sending it again cannot
      // help; the next change, a stroke rubbed out, is tried as usual.
      report("full");
    } else {
      waiting ??= elements;
      report("error");
      later(RETRY_MS);
    }
    return false;
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
    flush: () => void start(true),
    // Saves what is waiting and says whether the drawing on the screen is now
    // the one stored: something that goes on a box needs the box stored first.
    async stored() {
      if (busy) await last;
      return start(false);
    },
  };
}
