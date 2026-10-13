import type { BoardStage, StageStatus } from "@/db/schema";
import { MAX_STAGE_NAME, STAGE_COLORS, STAGE_SHAPES } from "./drawing";

export const UNNAMED_STAGE = "Untitled stage";

type Drawn = Record<string, unknown>;
type Box = {
  id: string;
  status: StageStatus;
  // Given with the mark, for a box that holds handwriting and no text.
  name?: string;
  x: number;
  y: number;
  height: number;
};

const number = (value: unknown) => (typeof value === "number" ? value : 0);
const boundTo = (value: unknown) =>
  typeof value === "object" && value !== null && "elementId" in value
    ? String(value.elementId)
    : null;

function stageBox(element: Drawn): Box | null {
  const { stage } = (element.customData ?? {}) as {
    stage?: { status: StageStatus; name?: string };
  };
  if (!stage || !STAGE_SHAPES.some((shape) => shape === element.type)) return null;
  return {
    id: String(element.id),
    status: stage.status,
    name: stage.name,
    x: number(element.x),
    y: number(element.y),
    height: number(element.height),
  };
}

export const isStage = (element: Drawn) => stageBox(element) !== null;

// A stage's box at that status and in its colour. What else its mark holds
// (a name) is kept.
export const atStatus = (element: Drawn, status: StageStatus) => ({
  ...element,
  customData: {
    stage: { ...(element.customData as { stage: object }).stage, status },
  },
  backgroundColor: STAGE_COLORS[status],
});

// Top to bottom, then left to right: boxes whose middles are within half a box
// of each other count as one row, so a row placed by hand reads in order.
function readingOrder(boxes: Box[]) {
  const middle = (box: Box) => box.y + box.height / 2;
  const down = [...boxes].sort((a, b) => middle(a) - middle(b));
  const rows: Box[][] = [];
  for (const box of down) {
    const row = rows.at(-1);
    if (row && middle(box) - middle(row[0]) <= row[0].height / 2) row.push(box);
    else rows.push([box]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

// The stages of a drawing in the order a client goes through them: along the
// arrows that join them, and as the boxes read on the page where no arrow decides.
export function stagesOf(elements: readonly Drawn[]): BoardStage[] {
  const boxes = readingOrder(
    elements.flatMap((element) => stageBox(element) ?? []),
  );
  const rank = new Map(boxes.map((box, index) => [box.id, index]));

  const names = new Map<string, string>();
  const after = new Map<string, Set<string>>();
  const waitingOn = new Map(boxes.map((box) => [box.id, 0]));
  for (const element of elements) {
    if (element.type === "text" && typeof element.containerId === "string") {
      const written = String(element.originalText ?? element.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (written) names.set(element.containerId, written.slice(0, MAX_STAGE_NAME));
    }
    if (element.type !== "arrow") continue;
    const from = boundTo(element.startBinding);
    const to = boundTo(element.endBinding);
    if (!from || !to || from === to || !rank.has(from) || !rank.has(to)) continue;
    const next = after.get(from) ?? new Set();
    if (next.has(to)) continue;
    after.set(from, next.add(to));
    waitingOn.set(to, waitingOn.get(to)! + 1);
  }

  // Each turn takes the earliest-reading box nothing left points at. Boxes that
  // only point at each other in a ring are taken in reading order.
  const left = new Set(boxes.map((box) => box.id));
  const ordered: Box[] = [];
  while (left.size > 0) {
    const ready = boxes.filter((box) => left.has(box.id));
    const box = ready.find(({ id }) => waitingOn.get(id)! <= 0) ?? ready[0];
    left.delete(box.id);
    ordered.push(box);
    for (const to of after.get(box.id) ?? []) {
      waitingOn.set(to, waitingOn.get(to)! - 1);
    }
  }

  return ordered.map((box) => ({
    elementId: box.id,
    name: names.get(box.id) ?? box.name ?? UNNAMED_STAGE,
    status: box.status,
  }));
}

// Where a board stands, for a line in a list: how much is done, the stage it is
// at now (the first under way, else the first not begun) and what is held up.
export function progressOf(stages: readonly BoardStage[]) {
  const first = (status: StageStatus) =>
    stages.find((stage) => stage.status === status);
  return {
    done: stages.filter(({ status }) => status === "done").length,
    total: stages.length,
    current: (first("in_progress") ?? first("not_started"))?.name ?? null,
    blocked: stages
      .filter(({ status }) => status === "blocked")
      .map(({ name }) => name),
  };
}
