import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { typedLinkChange } from "@/modules/workflows/typed-link";

type Written = { id: string; before: string };

// An address written or pasted on a board becomes a link by itself. Looked at only
// as writing finishes or after a paste, never per frame, so a large board pays nothing.
export function createTypedLinks() {
  let writing: Written | null = null;

  const apply = (api: ExcalidrawImperativeAPI, written: Written[]) => {
    const all = api.getSceneElements();
    const byId = new Map(all.map((element) => [element.id, element]));
    const changed = new Map<string, { link?: string | null; strokeColor?: string }>();
    const plainColor = api.getAppState().currentItemStrokeColor;
    for (const { id, before } of written) {
      const text = byId.get(id);
      if (text?.type !== "text") continue;
      // The whiteboard draws a link's icon and popup for the box, not the text in it.
      const holder = (text.containerId && byId.get(text.containerId)) || text;
      const change = typedLinkChange(before, text, holder, plainColor);
      if (!change) continue;
      changed.set(holder.id, { link: change.link });
      changed.set(text.id, {
        ...changed.get(text.id),
        strokeColor: change.strokeColor,
      });
    }
    if (changed.size === 0) return;
    api.updateScene({
      elements: all.map((element) => {
        const change = changed.get(element.id);
        return change ? newElementWith(element, change) : element;
      }),
      // Its own step, so one undo takes the link off and leaves the words.
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return {
    watch(api: ExcalidrawImperativeAPI | null, appState: AppState) {
      const editing =
        appState.editingTextElement?.type === "text" ? appState.editingTextElement : null;
      if (editing?.id === writing?.id) return;
      const finished = writing;
      writing = editing && { id: editing.id, before: editing.originalText };
      if (!finished || !api) return;
      // After this redraw, which the whiteboard is still in the middle of.
      requestAnimationFrame(() => apply(api, [finished]));
    },
    pasted(api: ExcalidrawImperativeAPI | null) {
      if (!api) return;
      const known = new Set(api.getSceneElements().map(({ id }) => id));
      // The whiteboard adds what was pasted straight after asking.
      setTimeout(() =>
        apply(
          api,
          api
            .getSceneElements()
            .filter(({ id, type }) => type === "text" && !known.has(id))
            .map(({ id }) => ({ id, before: "" })),
        ),
      );
    },
  };
}
