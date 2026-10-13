import type { BoardScene } from "@/db/schema";
import { STAGE_COLORS } from "./drawing";

export type StarterBoard = {
  key: string;
  name: string;
  description: string;
  // Each stage's place on a grid of columns and rows.
  stages: readonly { name: string; column: number; row: number }[];
  // Arrows, by the stages' places in the list above.
  paths: readonly (readonly [from: number, to: number])[];
};

const inARow = (...names: string[]) =>
  names.map((name, column) => ({ name, column, row: 0 }));
const oneAfterAnother = (count: number) =>
  Array.from({ length: count - 1 }, (_, index) => [index, index + 1] as const);

// Workflows offered in one click. A starter is added by its key from this list,
// so what it becomes is decided here and not by the request. Once added it is the
// owner's own and can be redrawn like any other.
export const STARTER_BOARDS: readonly StarterBoard[] = [
  {
    key: "prospecting",
    name: "Prospecting",
    description: "From a first look at someone worth approaching to a yes or a no.",
    stages: [
      ...inARow("Identified", "Contacted", "In conversation", "Proposal sent", "Won"),
      { name: "Lost", column: 4, row: 1 },
    ],
    paths: [...oneAfterAnother(5), [3, 5]],
  },
  {
    key: "website_project",
    name: "Website Project",
    description: "Delivering a website, from kickoff to handover.",
    stages: inARow("Kickoff", "Design", "Build", "Review", "Launch", "Delivered"),
    paths: oneAfterAnother(6),
  },
];

const BOX = { width: 190, height: 80 };
const STEP = { x: 270, y: 150 };
const FONT_SIZE = 20;
// Nunito, the whiteboard's plain font.
const FONT_FAMILY = 6;

// What every element of a drawing carries, whatever it is.
const drawn = (id: string, seed: number) => ({
  id,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  seed,
  version: 1,
  versionNonce: seed,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
});

// The drawing a starter begins as: a box for each stage with its name inside,
// joined by arrows. The whiteboard measures the text itself when it opens.
export function starterScene(starter: StarterBoard): BoardScene {
  const place = ({ column, row }: { column: number; row: number }) => ({
    x: column * STEP.x,
    y: row * STEP.y,
  });

  const boxes = starter.stages.flatMap((stage, index) => {
    const at = place(stage);
    const width = stage.name.length * FONT_SIZE * 0.55;
    const height = FONT_SIZE * 1.25;
    return [
      {
        ...drawn(`box-${index}`, index * 3 + 1),
        type: "rectangle",
        ...at,
        ...BOX,
        backgroundColor: STAGE_COLORS.not_started,
        roundness: { type: 3 },
        boundElements: [
          { type: "text", id: `name-${index}` },
          ...starter.paths.flatMap(([from, to], path) =>
            from === index || to === index
              ? [{ type: "arrow", id: `path-${path}` }]
              : [],
          ),
        ],
        customData: { stage: { status: "not_started" } },
      },
      {
        ...drawn(`name-${index}`, index * 3 + 2),
        type: "text",
        x: at.x + (BOX.width - width) / 2,
        y: at.y + (BOX.height - height) / 2,
        width,
        height,
        text: stage.name,
        originalText: stage.name,
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: `box-${index}`,
        autoResize: true,
        lineHeight: 1.25,
      },
    ];
  });

  const arrows = starter.paths.map(([from, to], path) => {
    const start = place(starter.stages[from]);
    const end = place(starter.stages[to]);
    // Out of the right-hand side and into the left; down a row, into the top.
    const down = end.y > start.y;
    const tail = { x: start.x + BOX.width, y: start.y + BOX.height / 2 };
    const head = down
      ? { x: end.x + BOX.width / 2, y: end.y }
      : { x: end.x, y: end.y + BOX.height / 2 };
    return {
      ...drawn(`path-${path}`, starter.stages.length * 3 + path + 1),
      type: "arrow",
      ...tail,
      width: Math.abs(head.x - tail.x),
      height: Math.abs(head.y - tail.y),
      points: [
        [0, 0],
        [head.x - tail.x, head.y - tail.y],
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: `box-${from}`, focus: 0, gap: 1 },
      endBinding: { elementId: `box-${to}`, focus: 0, gap: 1 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      roundness: null,
    };
  });

  return { elements: [...boxes, ...arrows] };
}
