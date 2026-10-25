// The colours offered on every whiteboard, in a grid as on a Miro board: a
// light, a bright and a dark shade of ten hues, a row of greys, and nothing.
// The light row holds the sticky notes' first five colours, so notes made
// before the grid still show as chosen. Nothing here touches the browser or
// the whiteboard, so it can be tested on its own.

export type GridColor = { name: string; value: string };

const HUES = [
  ["Red", "#ffc9c9", "#fa5252", "#c92a2a"],
  ["Orange", "#ffd8a8", "#fd7e14", "#d9480f"],
  ["Yellow", "#fff3a3", "#fcc419", "#e67700"],
  ["Lime", "#e9f5a8", "#94d82d", "#5c940d"],
  ["Green", "#c9f2c7", "#40c057", "#2b8a3e"],
  ["Teal", "#c3fae8", "#20c997", "#087f5b"],
  ["Blue", "#c3e4ff", "#339af0", "#1864ab"],
  ["Indigo", "#dbe4ff", "#5c7cfa", "#364fc7"],
  ["Violet", "#e5dbff", "#845ef7", "#5f3dc4"],
  ["Pink", "#ffc9de", "#f06595", "#a61e4d"],
] as const;

export const LIGHT_COLORS: GridColor[] = HUES.map(([hue, light]) => ({
  name: `Light ${hue.toLowerCase()}`,
  value: light,
}));
export const BRIGHT_COLORS: GridColor[] = HUES.map(([hue, , bright]) => ({
  name: hue,
  value: bright,
}));
export const DARK_COLORS: GridColor[] = HUES.map(([hue, , , dark]) => ({
  name: `Dark ${hue.toLowerCase()}`,
  value: dark,
}));
// The whiteboard's own line colour is the last, so a new board starts on it.
export const GREY_COLORS: GridColor[] = [
  { name: "White", value: "#ffffff" },
  { name: "Lightest grey", value: "#f1f3f5" },
  { name: "Light grey", value: "#dee2e6" },
  { name: "Grey", value: "#adb5bd" },
  { name: "Dark grey", value: "#495057" },
  { name: "Black", value: "#1e1e1e" },
];
export const TRANSPARENT = "transparent";

// How much shows through, kept as the colour's own alpha (`#rrggbbaa`).
export const SEE_THROUGH = [
  { label: "100%", alpha: "" },
  { label: "75%", alpha: "bf" },
  { label: "50%", alpha: "80" },
  { label: "25%", alpha: "40" },
] as const;
export type Alpha = (typeof SEE_THROUGH)[number]["alpha"];

const GRID = new Set(
  [...LIGHT_COLORS, ...BRIGHT_COLORS, ...DARK_COLORS, ...GREY_COLORS].map(
    ({ value }) => value,
  ),
);

// A colour as the grid reads it: one of its own and how much shows through,
// or nothing in the grid (a colour from an older drawing or pasted in).
export function readColor(color: string): { base: string; alpha: Alpha } | null {
  if (color === TRANSPARENT) return { base: TRANSPARENT, alpha: "" };
  const lower = color.toLowerCase();
  const base = lower.slice(0, 7);
  const alpha = SEE_THROUGH.find((choice) => choice.alpha === lower.slice(7));
  return GRID.has(base) && alpha ? { base, alpha: alpha.alpha } : null;
}

export const withAlpha = (base: string, alpha: Alpha) =>
  base === TRANSPARENT ? base : `${base}${alpha}`;

export type ColorTarget = "stroke" | "fill";

// The kinds of element the whiteboard gives a line colour and a fill.
const hasStroke = (type: string) => type !== "image" && type !== "frame";
const hasFill = (type: string) =>
  ["rectangle", "diamond", "ellipse", "line", "freedraw"].includes(type);

type Drawn = {
  id: string;
  type: string;
  isDeleted: boolean;
  strokeColor: string;
  backgroundColor: string;
  containerId?: string | null;
};

type Chosen = {
  selectedElementIds: Readonly<Record<string, true>>;
  editingTextElement?: { id: string } | null;
  activeTool: { type: string };
  currentItemStrokeColor: string;
  currentItemBackgroundColor: string;
};

const chosenOf = (elements: readonly Drawn[], state: Chosen) =>
  elements.filter(
    (element) =>
      !element.isDeleted &&
      (state.selectedElementIds[element.id] ||
        element.id === state.editingTextElement?.id),
  );

// What the grid shows as chosen: the selection's colours, or else those the
// next thing drawn takes. `fill` is nothing where nothing chosen has a fill.
export function pickedColors(elements: readonly Drawn[], state: Chosen) {
  const chosen = chosenOf(elements, state);
  if (chosen.length === 0) {
    return {
      stroke: state.currentItemStrokeColor,
      fill: hasFill(state.activeTool.type) ? state.currentItemBackgroundColor : null,
    };
  }
  const stroked = chosen.find(({ type }) => hasStroke(type));
  const filled = chosen.find(({ type }) => hasFill(type));
  return {
    stroke: stroked?.strokeColor ?? state.currentItemStrokeColor,
    fill: filled ? filled.backgroundColor : null,
  };
}

// The elements a colour goes on, as the whiteboard's own colour controls
// choose them: what is selected, and for a line colour the text written
// inside a selected box as well.
export function recolored(
  elements: readonly Drawn[],
  state: Chosen,
  target: ColorTarget,
): Set<string> {
  const chosen = chosenOf(elements, state);
  const ids = new Set(
    chosen
      .filter(({ type }) => (target === "stroke" ? hasStroke(type) : hasFill(type)))
      .map(({ id }) => id),
  );
  if (target === "stroke") {
    const boxes = new Set(chosen.map(({ id }) => id));
    for (const element of elements) {
      if (!element.isDeleted && element.containerId && boxes.has(element.containerId)) {
        ids.add(element.id);
      }
    }
  }
  return ids;
}
