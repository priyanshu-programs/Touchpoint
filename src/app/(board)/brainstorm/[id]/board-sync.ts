import {
  CaptureUpdateAction,
  hashElementsVersion,
  reconcileElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { z } from "zod";
import { brainstormElementsSave } from "@/modules/brainstorm/schema";
import { trimmed, type SaveState } from "../../workflows/[id]/board-saver";
import { createBoardLive } from "./board-live";

const QUIET_MS = 2_000;
const RETRY_MS = 10_000;
// How often an open board asks what other devices drew on it.
const LOOK_MS = 10_000;
// How often it asks anyway while the live room is telling it of every change.
const SAFETY_LOOK_MS = 60_000;
// How long changes are gathered before they are sent to the room.
const RELAY_MS = 50;
// How long what the room brings is gathered before it is drawn: each merge
// goes through the whole board, which a tablet feels.
const MERGE_MS = 100;
// How long a change another device sent is kept for it before this device saves
// it instead, should that device have gone before it could.
const HOLD_MS = 15_000;
// The most sent to the room at once. Anything more goes by the database.
const RELAY_BYTES = 200_000;
const MAX_NAMED = 2_000;
// A browser sends a request that outlives its page only if the body is small.
const KEEPALIVE_BYTES = 60_000;
// The bytes sent at once, well under what one request may carry: a big paste
// goes in a few saves, one after another.
const BATCH_BYTES = 2_000_000;

const storedList = z.array(z.tuple([z.string().min(1).max(100), z.number().int()])).max(MAX_NAMED);

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
  liveAddress,
  clock,
  elements: opened,
  sendable,
  report,
  received,
}: {
  address: string;
  // Where a device asks to join the board's live room.
  liveAddress: string;
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
  let lookAgain = false;
  let lastLook = 0;
  let mergedAt = -Infinity;
  // The version of each element as the live room last had it from or gave to
  // this board. Delivered is not stored, so it is counted apart from `sent`.
  const relayed = new Map(sent);
  // Changes the room brought, kept in case the device that made them never saves them.
  const held = new Map<string, { version: number; at: number }>();
  const inbox = new Map<string, Record<string, unknown>>();
  let relaying: ReturnType<typeof setTimeout> | undefined;
  let merging: ReturnType<typeof setTimeout> | undefined;
  let holding: ReturnType<typeof setTimeout> | undefined;

  const live = createBoardLive({
    address: liveAddress,
    received: heard,
    opened() {
      void look();
      relaySoon();
    },
    closed() {},
  });

  const unsent = (element: ExcalidrawElement) =>
    (sent.get(element.id) ?? 0) < element.version &&
    held.get(element.id)?.version !== element.version &&
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
      void live.send(
        versions.length > MAX_NAMED
          ? '{"t":"look"}'
          : JSON.stringify({ t: "stored", stored: versions }),
      );
      // Nothing else was saved in between, so nothing has been missed.
      if (!saved.behind) since = saved.clock;
      if (saved.behind || lookAgain) {
        lookAgain = false;
        void look();
      }
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
    if (!api) return;
    if (busy) {
      lookAgain = true;
      return;
    }
    busy = true;
    lastLook = performance.now();
    const changes = await changesSince(address, since).catch(() => null);
    busy = false;
    if (!api || !changes) return;
    if (changes === "reset") return reload();
    if (changes.elements.length > 0) merge(changes.elements);
    since = Math.max(since, changes.clock);
    if (lookAgain) {
      lookAgain = false;
      void look();
    }
  }

  function relaySoon() {
    relaying ??= setTimeout(() => {
      relaying = undefined;
      relay();
    }, RELAY_MS);
  }

  // Sends the room what changed since it was last told. What does not fit goes
  // by the database, and the other device fetches it when told it is stored.
  function relay() {
    if (!api || !live.isOpen()) return;
    const parts: string[] = [];
    let bytes = 0;
    for (const element of api.getSceneElementsIncludingDeleted()) {
      if (
        (relayed.get(element.id) ?? 0) >= element.version ||
        (element.isDeleted && !relayed.has(element.id)) ||
        !sendable(element)
      ) {
        continue;
      }
      relayed.set(element.id, element.version);
      const part = JSON.stringify(element, trimmed);
      if (bytes + part.length > RELAY_BYTES) continue;
      parts.push(part);
      bytes += part.length;
    }
    if (parts.length > 0) void live.send(`{"t":"changes","elements":[${parts.join(",")}]}`);
  }

  // What the room brought. It cannot read or check what it forwards, so a change
  // has to pass here what a save has to pass on the server.
  function heard(message: unknown) {
    if (!api || typeof message !== "object" || message === null) return;
    const { t, elements, stored } = message as { t?: unknown; elements?: unknown; stored?: unknown };
    if (t === "look") {
      void look();
    } else if (t === "changes") {
      const checked = brainstormElementsSave.safeParse({ since: 0, elements });
      if (!checked.success) return;
      for (const element of checked.data.elements) {
        const waiting = inbox.get(element.id);
        if (!waiting || (waiting.version as number) <= element.version) {
          inbox.set(element.id, element);
        }
      }
      merging ??= setTimeout(mergeInbox, MERGE_MS);
    } else if (t === "stored") {
      const checked = storedList.safeParse(stored);
      if (checked.success) markStored(checked.data);
    }
  }

  function mergeInbox() {
    clearTimeout(merging);
    merging = undefined;
    if (inbox.size === 0) return;
    const remote = [...inbox.values()];
    inbox.clear();
    merge(remote, true);
  }

  // Another device has stored these, so this one need not. One this board does
  // not have yet was too large for the room, and is fetched.
  function markStored(stored: [string, number][]) {
    if (!api) return;
    mergeInbox();
    const here = new Map(api.getSceneElementsIncludingDeleted().map((element) => [element.id, element]));
    let behind = false;
    for (const [id, version] of stored) {
      const element = here.get(id);
      if (!element || element.version < version) behind = true;
      else if (element.version === version && (sent.get(id) ?? 0) < version) sent.set(id, version);
      const kept = held.get(id);
      if (kept && kept.version <= version) held.delete(id);
    }
    if (behind) void look();
  }

  function hold(id: string, version: number) {
    held.set(id, { version, at: performance.now() });
    holding ??= setTimeout(releaseHeld, HOLD_MS);
  }

  function releaseHeld() {
    holding = undefined;
    const cutoff = performance.now() - HOLD_MS;
    let released = false;
    let oldest = Infinity;
    for (const [id, { at }] of held) {
      if (at <= cutoff) {
        held.delete(id);
        released = true;
      } else {
        oldest = Math.min(oldest, at);
      }
    }
    if (oldest !== Infinity) holding = setTimeout(releaseHeld, oldest - cutoff);
    if (released) later(0);
  }

  function merge(remote: Record<string, unknown>[], fromRoom = false) {
    if (!api) return;
    mergedAt = performance.now();
    const restored = restoreElements(
      remote as unknown as ExcalidrawElement[],
      null,
    ) as RemoteExcalidrawElement[];
    // Merging can renumber an element's place in the drawing order, which raises
    // its version and draws a new nonce in place. So these are read first: a
    // renumbered element is a change of this device's own, to send on like any
    // other. Counted as received, the devices would hold two copies at one version.
    const arrived = restored.map(({ id, version, versionNonce }) => ({ id, version, versionNonce }));
    const merged = reconcileElements(
      api.getSceneElementsIncludingDeleted(),
      restored,
      api.getAppState(),
    );
    // Not a step of this board's undo: it was drawn somewhere else.
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
    // Where the server's copy was kept, this board now has what the server
    // has. Where this board's own was kept, it is still to be sent.
    const now = new Map<string, ExcalidrawElement>(merged.map((element) => [element.id, element]));
    const taken = arrived.filter((element) => {
      const kept = now.get(element.id);
      return kept?.version === element.version && kept.versionNonce === element.versionNonce;
    });
    const takenIds = new Set(taken.map(({ id }) => id));
    // Whichever copy was kept, what arrived is known elsewhere, so rubbing it out
    // here must reach the others even if this device has sent nothing of it yet.
    for (const { id, version } of arrived) {
      relayed.set(id, Math.max(relayed.get(id) ?? 0, version));
      if (!fromRoom) sent.set(id, Math.max(sent.get(id) ?? 0, version));
      else if (!sent.has(id)) sent.set(id, 0);
    }
    for (const { id, version } of taken) {
      if (fromRoom) {
        if ((sent.get(id) ?? 0) < version) hold(id, version);
      } else {
        const kept = held.get(id);
        if (kept && kept.version <= version) held.delete(id);
      }
    }
    received(restored.filter((element) => takenIds.has(element.id) || now.get(element.id) === element));
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
      relaySoon();
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
    // Saves at once what is waiting, what is held for another device too: the
    // page is being hidden or left.
    flush() {
      held.clear();
      void save(true);
    },
    // Whether a merge has just happened, so what it sets off can wait for a quiet moment.
    justMerged: () => performance.now() - mergedAt < MERGE_MS,
    liveStatus: () => live.status(),
    // Called with the whiteboard once it is there: starts looking for what
    // other devices draw while the page is in view.
    attach(board: ExcalidrawImperativeAPI) {
      api = board;
      looking = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (!live.isOpen() || performance.now() - lastLook >= SAFETY_LOOK_MS) void look();
      }, LOOK_MS);
      document.addEventListener("visibilitychange", shown);
      live.start();
    },
    stop() {
      clearTimeout(timer);
      clearInterval(looking);
      clearTimeout(relaying);
      clearTimeout(merging);
      clearTimeout(holding);
      relaying = merging = holding = undefined;
      document.removeEventListener("visibilitychange", shown);
      live.stop();
      api = null;
    },
  };
}
