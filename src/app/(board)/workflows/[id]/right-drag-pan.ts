import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, type RefObject } from "react";

const DRAG_PX = 4;
const RIGHT = 2;

type Hold = {
  pointerId: number;
  canvas: HTMLCanvasElement;
  fromX: number;
  fromY: number;
  lastX: number;
  lastY: number;
  waitingX: number;
  waitingY: number;
  frame: number;
  panning: boolean;
  cursor: string;
  menuAsked: boolean;
};

// Holding the right mouse button and dragging moves the board; a right click
// without a drag still opens the whiteboard's menu.
export function useRightDragPan(
  board: RefObject<HTMLDivElement | null>,
  api: ExcalidrawImperativeAPI | null,
) {
  useEffect(() => {
    if (!api) return;
    let hold: Hold | null = null;
    let menuToSwallow = false;
    let replaying = false;

    const applyMove = () => {
      if (!hold) return;
      hold.frame = 0;
      const { zoom, scrollX, scrollY } = api.getAppState();
      api.updateScene({
        appState: {
          scrollX: scrollX + hold.waitingX / zoom.value,
          scrollY: scrollY + hold.waitingY / zoom.value,
        },
      });
      hold.waitingX = 0;
      hold.waitingY = 0;
    };

    const letGo = () => {
      if (!hold) return null;
      cancelAnimationFrame(hold.frame);
      if (hold.waitingX || hold.waitingY) applyMove();
      if (hold.panning) hold.canvas.style.cursor = hold.cursor;
      const held = hold;
      hold = null;
      return held;
    };

    const pressed = (event: PointerEvent) => {
      menuToSwallow = false;
      letGo();
      const { target } = event;
      if (
        event.button !== RIGHT ||
        event.buttons !== RIGHT ||
        event.pointerType !== "mouse" ||
        !(target instanceof HTMLCanvasElement) ||
        !board.current?.contains(target)
      ) {
        return;
      }
      hold = {
        pointerId: event.pointerId,
        canvas: target,
        fromX: event.clientX,
        fromY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        waitingX: 0,
        waitingY: 0,
        frame: 0,
        panning: false,
        cursor: "",
        menuAsked: false,
      };
    };

    const moved = (event: PointerEvent) => {
      if (event.pointerId !== hold?.pointerId) return;
      if (!(event.buttons & RIGHT)) {
        letGo();
        return;
      }
      if (!hold.panning) {
        const across = event.clientX - hold.fromX;
        const down = event.clientY - hold.fromY;
        if (Math.hypot(across, down) < DRAG_PX) return;
        hold.panning = true;
        hold.cursor = hold.canvas.style.cursor;
        hold.canvas.style.cursor = "grabbing";
      }
      // Keeps the whiteboard from looking for what is under the pointer on
      // every move, which is slow on a large board and pointless mid-pan.
      event.stopPropagation();
      hold.waitingX += event.clientX - hold.lastX;
      hold.waitingY += event.clientY - hold.lastY;
      hold.lastX = event.clientX;
      hold.lastY = event.clientY;
      hold.frame ||= requestAnimationFrame(applyMove);
    };

    const released = (event: PointerEvent) => {
      if (event.pointerId !== hold?.pointerId) return;
      const held = letGo();
      if (held?.panning) {
        menuToSwallow = true;
      } else if (held?.menuAsked) {
        replaying = true;
        held.canvas.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: RIGHT,
            clientX: held.fromX,
            clientY: held.fromY,
          }),
        );
        replaying = false;
      }
    };

    const cancelled = (event: PointerEvent) => {
      if (event.pointerId === hold?.pointerId) letGo();
    };

    // Windows asks for the menu after the button is released, Mac and Linux as it
    // is pressed, when it is not yet known whether this is a click or a drag.
    const menu = (event: MouseEvent) => {
      if (replaying) return;
      if (hold) {
        hold.menuAsked = true;
      } else if (menuToSwallow) {
        menuToSwallow = false;
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const left = () => {
      letGo();
    };

    const capture = { capture: true };
    window.addEventListener("pointerdown", pressed, capture);
    window.addEventListener("pointermove", moved, capture);
    window.addEventListener("pointerup", released, capture);
    window.addEventListener("pointercancel", cancelled, capture);
    window.addEventListener("contextmenu", menu, capture);
    window.addEventListener("blur", left);
    return () => {
      letGo();
      window.removeEventListener("pointerdown", pressed, capture);
      window.removeEventListener("pointermove", moved, capture);
      window.removeEventListener("pointerup", released, capture);
      window.removeEventListener("pointercancel", cancelled, capture);
      window.removeEventListener("contextmenu", menu, capture);
      window.removeEventListener("blur", left);
    };
  }, [api, board]);
}
