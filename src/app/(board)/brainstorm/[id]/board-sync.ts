import {
  CaptureUpdateAction,
  hashElementsVersion,
  reconcileElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { trimmed, type SaveState } from "../../workflows/[id]/board-saver";

const QUIET_MS = 2_000;
const RETRY_MS = 10_000;
// How often an open board asks what other devices drew on it.
const LOOK_MS = 10_000;
// A browser sends a request that outlives its page only if the body is small.
const KEEPALIVE_BYTES = 60_000;
// The bytes sent at once, well under what one request may carry: a big paste
// goes in a few saves, one after another.
const BATCH_BYTES = 2_000_000;

type Page =
  | { clock: number; elements: Record<string, unknown>[]; next: string | null }
  | { reset: true };

// The board's elements after a clock, every page of them.
async function changesSince(address: string, since: number) {
  const elements: Record<string, unknown>[] = [];
  let clock: number | null = null;
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ since: String(since) });
    if (after) query.set("after", after);
    const response = await fetch(`${address}?${query}`);
    if (!response.ok) throw new Error(`changes ${response.status}`);
    const page = (await response.json()) as Page;
    if ("reset" in page) return "reset" as const;
    // A page later than the first may hold changes made since; the next look
    // starts from the first page's clock, so they are asked for again.
    clock ??= page.clock;
    elements.push(...page.elements);
    after = page.next;
  } while (after);
  return { clock: clock!, elements };
}

// The whole board as it stands, in the order it is drawn in.
export async function loadBoard(address: string) {
  const loaded = await changesSince(address, 0);
  if (loaded === "reset") throw new Error("reset from clock 0");
  const at = ({ index }: Record<string, unknown>) => (typeof index === "string" ? index : "￿");
  // A plain comparison of fractional indices, as the whiteboard makes them.
  loaded.elements.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
  return loaded;
}

// Keeps a brainstorm board in step with the server the way the whiteboard keeps
// a drawing shared live in step: each element carries a version, a save sends
// only the elements whose version moved since they were last sent, and what
// another device saved is merged in by the whiteboard's own rule.
export function createBoardSync({
  address,
  clock,
  elements: opened,
  sendable,
  report,
  received,
}: {
  address: string;
  // The board's clock and elements as the whiteboard opened them.
  clock: number;
  elements: readonly ExcalidrawElement[];
  // Whether an element may be sent yet: a picture waits until it is stored.
  sendable: (element: ExcalidrawElement) => boolean;
  report: (state: SaveState) => void;
  // Told of the elements another device saved, once they are on this board.
  received: (elements: readonly ExcalidrawElement[]) => void;
}) {
  // The version of each element as the server last had it from or gave to
  // this board. An element whose version is past it is still to be sent.
  const sent = new Map(opened.map(({ id, version }) => [id, version]));
  let since = clock;
  let api: ExcalidrawImperativeAPI | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let looking: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let full = false;
  let seen: number | null = null;

  const unsent = (element: ExcalidrawElement) =>
    (sent.get(element.id) ?? 0) < element.version &&
    // One deleted before it was ever stored needs no saving.
    !(element.isDeleted && !sent.has(element.id)) &&
    sendable(element);

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void save(false), ms);
  };

  async function save(leaving: boolean): Promise<void> {
    clearTimeout(timer);
    if (!api) return;
    if (busy) return later(QUIET_MS);
    const pending = api.getSceneElementsIncludingDeleted().filter(unsent);
    if (pending.length === 0) {
      report(full ? "full" : "saved");
      return;
    }

    // The whiteboard changes its elements in place, so what is sent and the
    // versions it is sent at are taken together, now.
    const batch: ExcalidrawElement[] = [];
    const parts: string[] = [];
    let bytes = 0;
    for (const element of pending) {
      const part = JSON.stringify(element, trimmed);
      if (batch.length > 0 && bytes + part.length > BATCH_BYTES) break;
      batch.push(element);
      parts.push(part);
      bytes += part.length;
    }
    const versions = batch.map(({ id, version }) => [id, version] as const);
    const body = `{"since":${since},"elements":[${parts.join(",")}]}`;

    busy = true;
    report("saving");
    const response = await fetch(address, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: leaving && body.length < KEEPALIVE_BYTES,
    }).catch(() => null);
    const saved = response?.ok
      ? ((await response.json()) as { clock: number; behind: boolean })
      : null;
    busy = false;

    if (saved) {
      full = false;
      for (const [id, version] of versions) {
        if ((sent.get(id) ?? 0) < version) sent.set(id, version);
      }
      // Nothing else was saved in between, so nothing has been missed.
      if (!saved.behind) since = saved.clock;
      else void look();
      if (batch.length < pending.length) return save(leaving);
      // Drawn on while that save was on its way.
      // The board may have closed while it was on its way.
      if (!api) return;
      if (api.getSceneElementsIncludingDeleted().some(unsent)) {
        report("unsaved");
        later(QUIET_MS);
      } else {
        report("saved");
      }
      return;
    }
    if (response?.status === 413) {
      // The board holds as much as it can. Sending this again cannot help;
      // the next change, something rubbed out, is tried as usual.
      full = true;
      report("full");
    } else {
      report("error");
      later(RETRY_MS);
    }
  }

  // Merges in what other devices saved since this board last looked.
  async function look() {
    if (!api || busy) return;
    busy = true;
    const changes = await changesSince(address, since).catch(() => null);
    busy = false;
    if (!api || !changes) return;
    if (changes === "reset") return reload();
    if (changes.elements.length > 0) merge(changes.elements);
    since = Math.max(since, changes.clock);
  }

  function merge(remote: Record<string, unknown>[]) {
    if (!api) return;
    const restored = restoreElements(
      remote as unknown as ExcalidrawElement[],
      null,
    ) as RemoteExcalidrawElement[];
    const merged = reconcileElements(
      api.getSceneElementsIncludingDeleted(),
      restored,
      api.getAppState(),
    );
    // Not a step of this board's undo: it was drawn somewhere else.
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
    // Where the server's copy was kept, this board now has what the server
    // has. Where this board's own was kept, it is still to be sent.
    const now = new Map(merged.map((element) => [element.id, element]));
    const taken = restored.filter((element) => {
      const kept = now.get(element.id);
      return kept?.version === element.version && kept.versionNonce === element.versionNonce;
    });
    for (const { id, version } of taken) sent.set(id, version);
    received(taken);
  }

  // Elements deleted long ago were cleared from the server before this board
  // heard of them: the board is loaded whole again, and what the server no
  // longer has, it once stored, and this board has not changed since, goes.
  async function reload() {
    const whole = await loadBoard(address).catch(() => null);
    if (!api || !whole) return;
    const there = new Set(whole.elements.map(({ id }) => id as string));
    const gone = api
      .getSceneElementsIncludingDeleted()
      .filter(
        (element) =>
          !element.isDeleted && !there.has(element.id) && sent.get(element.id) === element.version,
      )
      .map((element) => ({ ...element, isDeleted: true }));
    merge(whole.elements);
    if (gone.length > 0) {
      const ids = new Set(gone.map(({ id }) => id));
      api.updateScene({
        elements: [
          ...api.getSceneElementsIncludingDeleted().filter(({ id }) => !ids.has(id)),
          ...gone,
        ],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
    since = whole.clock;
  }

  const shown = () => {
    if (document.visibilityState === "visible") void look();
  };

  return {
    // Called with the whole drawing, deleted elements too, whenever the
    // whiteboard redraws.
    changed(elements: readonly ExcalidrawElement[]) {
      // Only a change to what may be sent is looked at, so a board that is
      // full is not sent again on every scroll, and a picture just stored is.
      const now = hashElementsVersion(elements.filter(sendable));
      if (now === seen) return;
      seen = now;
      if (!elements.some(unsent)) {
        // What was waiting was taken back, a stroke undone before it was stored.
        if (!busy) {
          clearTimeout(timer);
          full = false;
          report("saved");
        }
        return;
      }
      report("unsaved");
      later(QUIET_MS);
    },
    // Saves at once what is waiting: the page is being hidden or left.
    flush: () => void save(true),
    // Called with the whiteboard once it is there: starts looking for what
    // other devices draw while the page is in view.
    attach(board: ExcalidrawImperativeAPI) {
      api = board;
      looking = setInterval(() => {
        if (document.visibilityState === "visible") void look();
      }, LOOK_MS);
      document.addEventListener("visibilitychange", shown);
    },
    stop() {
      clearTimeout(timer);
      clearInterval(looking);
      document.removeEventListener("visibilitychange", shown);
      api = null;
    },
  };
}
