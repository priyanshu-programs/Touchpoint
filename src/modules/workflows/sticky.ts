// Which boxes on a whiteboard are sticky notes, and which of them are on the
// screen. Nothing here touches the browser or the whiteboard, so it can be
// tested on its own.

import { BRIGHT_COLORS, LIGHT_COLORS } from "./colors";

// Where a note is in the drawing. `version` is the whiteboard's own count of
// changes to it, which tells one drawing of it from the next.
export type StickyNote = {
  id: string;
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

type Drawn = StickyNote & {
  type: string;
  isDeleted: boolean;
  customData?: Record<string, unknown> | null;
};

type Area = { x: number; y: number; width: number; height: number };

// How far past its box a note's shadow reaches, in the drawing's measures.
const REACH = 40;

export const isSticky = (element: { customData?: Record<string, unknown> | null }) =>
  element.customData?.sticky === true;

// The notes that are on the screen, or near enough for their shadow to show.
export function stickyNotes(elements: readonly Drawn[], seen: Area): StickyNote[] {
  return elements
    .filter(
      (element) =>
        !element.isDeleted &&
        isSticky(element) &&
        element.x - REACH < seen.x + seen.width &&
        element.x + element.width + REACH > seen.x &&
        element.y - REACH < seen.y + seen.height &&
        element.y + element.height + REACH > seen.y,
    )
    .map(({ id, version, x, y, width, height, angle }) => ({
      id,
      version,
      x,
      y,
      width,
      height,
      angle,
    }));
}

// Whether the text being written is inside a note, so the board can show it
// in the note's own light colours.
export const writingOnNote = (
  elements: readonly { id: string; customData?: Record<string, unknown> | null }[],
  editing: { id: string; containerId?: string | null } | null,
) =>
  Boolean(editing?.containerId) &&
  elements.some((element) => element.id === editing?.containerId && isSticky(element));

export const sameNotes = (before: readonly StickyNote[], now: readonly StickyNote[]) =>
  before.length === now.length &&
  before.every(
    (note, at) => note.id === now[at].id && note.version === now[at].version,
  );

const STICKY_FILLS = new Set([...LIGHT_COLORS, ...BRIGHT_COLORS].map(({ value }) => value));
// The whiteboard's own number for the rounded corners a note was first given.
const ROUNDED = 3;

// A note put down before notes carried a mark: a box with no outline, a solid
// fill in one of the notes' colours and the rounded corners it was given.
export const unmarkedSticky = (element: {
  type: string;
  isDeleted: boolean;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  roundness: { type: number } | null;
  customData?: Record<string, unknown> | null;
}) =>
  element.type === "rectangle" &&
  !element.isDeleted &&
  !isSticky(element) &&
  element.strokeColor === "transparent" &&
  element.fillStyle === "solid" &&
  STICKY_FILLS.has(element.backgroundColor) &&
  element.roundness?.type === ROUNDED;
