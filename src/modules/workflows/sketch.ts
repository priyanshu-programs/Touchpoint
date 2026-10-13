// What a stroke of the pen was meant to be, worked out from its points alone.
// Nothing here touches the database, so the browser can load it.

type Point = readonly [number, number];

// How far apart the two ends may be, as a share of the stroke's diagonal.
const GAP = 0.2;
// How much of its bounding box a stroke must take in to count as a shape. A
// zigzag that ends where it began takes in next to nothing.
const ENCLOSED = 0.6;
// A drawn ellipse takes in about 0.79 of its box and a drawn box nearly all.
const BOXY = 0.86;

// The shape a stroke closes into, if it does: a box, a circle, or neither.
export function closedShape(
  points: readonly Point[],
): "rectangle" | "ellipse" | null {
  if (points.length < 8) return null;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  // Twice the area inside the stroke, with the last point joined to the first.
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const [x, y] = points[index];
    const [nextX, nextY] = points[(index + 1) % points.length];
    twice += x * nextY - nextX * y;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const width = right - left;
  const height = bottom - top;
  if (width === 0 || height === 0) return null;

  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];
  if (Math.hypot(endX - startX, endY - startY) > GAP * Math.hypot(width, height)) {
    return null;
  }

  const enclosed = Math.abs(twice) / 2 / (width * height);
  // More than its own box means the pen went round more than once.
  if (enclosed < ENCLOSED || enclosed > 1) return null;
  return enclosed >= BOXY ? "rectangle" : "ellipse";
}
