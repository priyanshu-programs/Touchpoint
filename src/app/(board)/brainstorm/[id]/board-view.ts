export type BoardView = { zoom: number; scrollX: number; scrollY: number };

type Size = { width: number; height: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type Placed = {
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  points?: readonly (readonly number[])[];
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;
// As the whiteboard's own "fit to screen" leaves a margin.
const FIT = 0.9;
// A stroke's points run from its start, so they can reach left of and above it.
// Rotation is left out: this only has to bring the drawing into view.
export function boundsOf(elements: readonly Placed[]): Bounds | null {
  let bounds: Bounds | null = null;
  const take = (x: number, y: number) => {
    bounds ??= { minX: x, minY: y, maxX: x, maxY: y };
    if (x < bounds.minX) bounds.minX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y > bounds.maxY) bounds.maxY = y;
  };
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (element.points?.length) {
      for (const [x, y] of element.points) take(element.x + x, element.y + y);
    } else {
      take(element.x, element.y);
      take(element.x + element.width, element.y + element.height);
    }
  }
  return bounds;
}

export function fittedView({ minX, minY, maxX, maxY }: Bounds, size: Size): BoardView {
  const across = Math.max(maxX - minX, 1);
  const down = Math.max(maxY - minY, 1);
  const zoom = Math.max(MIN_ZOOM, Math.min(1, (FIT * Math.min(size.width / across, size.height / down))));
  return {
    zoom,
    scrollX: size.width / (2 * zoom) - (minX + maxX) / 2,
    scrollY: size.height / (2 * zoom) - (minY + maxY) / 2,
  };
}

const sees = ({ zoom, scrollX, scrollY }: BoardView, bounds: Bounds, size: Size) =>
  -scrollX < bounds.maxX &&
  -scrollX + size.width / zoom > bounds.minX &&
  -scrollY < bounds.maxY &&
  -scrollY + size.height / zoom > bounds.minY;

const storageKey = (boardId: string) => `board-view:${boardId}`;

const isView = (value: unknown): value is BoardView => {
  const view = value as Partial<BoardView> | null;
  return (
    typeof view === "object" &&
    view !== null &&
    Number.isFinite(view.zoom) &&
    Number.isFinite(view.scrollX) &&
    Number.isFinite(view.scrollY) &&
    view.zoom! >= MIN_ZOOM &&
    view.zoom! <= MAX_ZOOM
  );
};

function rememberedView(boardId: string): BoardView | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(boardId)) ?? "null");
    return isView(stored) ? stored : null;
  } catch {
    return null;
  }
}

// Only where this device was looking on the board, so reopening it draws what
// was on screen and not the whole drawing.
export function rememberView(boardId: string, { zoom, scrollX, scrollY }: BoardView) {
  try {
    localStorage.setItem(storageKey(boardId), JSON.stringify({ zoom, scrollX, scrollY }));
  } catch {
    // Storage full or turned off: the board just opens fitted next time.
  }
}

// Where a board opens: where this device left it, unless that shows nothing of
// the drawing any more, else the whole drawing in view. An empty board stays
// where it is, or the first box drawn on it would jump to the middle.
export function openingView(
  boardId: string,
  elements: readonly Placed[],
  size: Size,
): BoardView | null {
  const bounds = boundsOf(elements);
  if (!bounds) return null;
  const remembered = rememberedView(boardId);
  return remembered && sees(remembered, bounds, size) ? remembered : fittedView(bounds, size);
}
