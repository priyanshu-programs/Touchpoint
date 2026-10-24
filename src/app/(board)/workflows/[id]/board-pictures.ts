import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  FileId,
} from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { PICTURE_REFUSALS } from "@/app/(app)/workflows/attach-messages";

const RETRY_MS = 10_000;
// Pictures sent at one time; the rest wait their turn.
const TOGETHER = 3;

type Refusal = keyof typeof PICTURE_REFUSALS;

// The bytes a `data:` address holds. Unpacked here and not fetched: the page
// may ask only this app for anything, and a `data:` address is not this app.
function blobOf(dataURL: string) {
  const comma = dataURL.indexOf(",");
  const [type] = dataURL.slice("data:".length, comma).split(";");
  const bytes = Uint8Array.from(atob(dataURL.slice(comma + 1)), (byte) =>
    byte.charCodeAt(0),
  );
  return new Blob([bytes], { type });
}

const dataURLOf = (blob: Blob) =>
  new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as DataURL);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Keeps the pictures of a whiteboard on the server. The drawing holds only a
// picture's id, so a picture is fetched by its id as the whiteboard opens, and
// one put on the whiteboard is sent under its id before the drawing that shows
// it is. `address` is where the board's pictures are sent and fetched; `held`
// is what the server has; `report` is told whether a picture is still on its way.
export function createBoardPictures({
  address,
  held,
  report,
}: {
  address: string;
  held: readonly string[];
  report: (sending: boolean) => void;
}) {
  const kept = new Set(held);
  const sending = new Set<string>();
  // Tried and not taken for now; left alone until the next try.
  const waiting = new Set<string>();
  let api: ExcalidrawImperativeAPI | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  async function send(key: string, dataURL: string): Promise<"kept" | "later" | Refusal> {
    let picture: Blob;
    try {
      picture = blobOf(dataURL);
    } catch {
      return "kind";
    }
    if (picture.size > MAX_FILE_BYTES) return "too_large";

    const body = new FormData();
    body.set("key", key);
    body.set("file", picture);
    const response = await fetch(address, { method: "POST", body }).catch(() => null);
    if (!response) return "later";
    if (response.ok) return "kept";
    // The hosting turns an oversized request away itself, with no reason given.
    if (response.status === 413) return "too_large";
    // An id the server will not keep a picture under: one from another program.
    if (response.status === 400) return "kind";
    const { reason } = await response.json().catch(() => ({ reason: null }));
    return reason in PICTURE_REFUSALS ? (reason as Refusal) : "later";
  }

  // Changes every element showing that picture, without a step to undo. It is
  // counted as a change even when nothing differs, so the whiteboard redraws
  // and the drawing is looked at again.
  function change(
    key: string,
    updates: Partial<Pick<ExcalidrawImageElement, "status" | "isDeleted">>,
  ) {
    api?.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((element) =>
          element.type === "image" && element.fileId === key
            ? newElementWith(element, updates, true)
            : element,
        ),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  function settle(key: string, outcome: Awaited<ReturnType<typeof send>>) {
    sending.delete(key);
    if (outcome === "kept") kept.add(key);
    if (!api) return;
    if (outcome === "kept") {
      change(key, { status: "saved" });
    } else if (outcome === "later") {
      waiting.add(key);
      clearTimeout(timer);
      timer = setTimeout(() => {
        waiting.clear();
        look();
      }, RETRY_MS);
    } else {
      // Not a picture this app keeps, or no room for it: it comes off the
      // whiteboard, which would otherwise show what a reload loses.
      change(key, { isDeleted: true });
      api.setToast({
        message: PICTURE_REFUSALS[outcome],
        closable: true,
        duration: 10_000,
      });
    }
    look();
  }

  // Sends every picture the drawing shows that the server does not have yet.
  function look(
    elements: readonly ExcalidrawElement[] | undefined = api?.getSceneElements(),
    files: BinaryFiles | undefined = api?.getFiles(),
  ) {
    if (!elements || !files) return;
    const unsent = new Set<string>();
    for (const element of elements) {
      if (element.type !== "image" || element.isDeleted) continue;
      const key = element.fileId;
      // A picture with no bytes here is one that could not be fetched; there
      // is nothing to send for it.
      if (key && !kept.has(key) && files[key]) unsent.add(key);
    }
    for (const key of unsent) {
      if (sending.size >= TOGETHER) break;
      if (sending.has(key) || waiting.has(key)) continue;
      sending.add(key);
      void send(key, files[key].dataURL).then((outcome) => settle(key, outcome));
    }
    if (busy !== unsent.size > 0) {
      busy = unsent.size > 0;
      report(busy);
    }
  }

  return {
    // Whether the server has the picture an element shows. Only then is the
    // element sent with the drawing.
    has: (key: string | null) => key !== null && kept.has(key),
    look,
    // Called with the whiteboard once it is there: gives it the stored pictures.
    attach(board: ExcalidrawImperativeAPI) {
      api = board;
      for (const key of held) {
        void fetch(`${address}/${key}`)
          .then(async (response) => {
            if (!response.ok) return;
            const picture = await response.blob();
            board.addFiles([
              {
                id: key as FileId,
                dataURL: await dataURLOf(picture),
                mimeType: picture.type as BinaryFileData["mimeType"],
                created: Date.now(),
              },
            ]);
          })
          // Left as an empty frame; a reload fetches it again.
          .catch(() => undefined);
      }
      look();
    },
    stop() {
      clearTimeout(timer);
      api = null;
    },
  };
}
