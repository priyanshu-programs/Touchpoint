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

// Which stages each stage's arrows point at, each pair once. Arrows that join
// anything other than two of the given stages are left out.
export type StageLinks = Map<string, Set<string>>;

export function stageLinks(
  elements: readonly Drawn[],
  stageIds: ReadonlySet<string>,
): StageLinks {
  const after: StageLinks = new Map();
  for (const element of elements) {
    if (element.type !== "arrow") continue;
    const from = boundTo(element.startBinding);
    const to = boundTo(element.endBinding);
    if (!from || !to || from === to || !stageIds.has(from) || !stageIds.has(to)) {
      continue;
    }
    after.set(from, (after.get(from) ?? new Set()).add(to));
  }
  return after;
}

// Every stage reached from one by following arrows one way. Only arrows that
// lead on in the stage order count, so an arrow drawn back to an earlier stage
// (a review that loops to the start) does not make that stage come after.
function reached(
  links: StageLinks,
  order: readonly string[],
  id: string,
  backwards: boolean,
) {
  const rank = new Map(order.map((stage, index) => [stage, index]));
  const forward = [...links].flatMap(([from, tos]) =>
    [...tos]
      .filter((to) => rank.get(from)! < rank.get(to)!)
      .map((to) => (backwards ? [to, from] : [from, to])),
  );
  if (forward.length === 0) {
    // Without arrows between stages, the order is all there is.
    const at = order.indexOf(id);
    return new Set(backwards ? order.slice(0, at) : order.slice(at + 1));
  }
  const found = new Set<string>();
  const waiting = [id];
  while (waiting.length > 0) {
    const from = waiting.pop()!;
    for (const [start, to] of forward) {
      if (start !== from || found.has(to)) continue;
      found.add(to);
      waiting.push(to);
    }
  }
  return found;
}

export const upstreamOf = (links: StageLinks, order: readonly string[], id: string) =>
  reached(links, order, id, true);
export const downstreamOf = (links: StageLinks, order: readonly string[], id: string) =>
  reached(links, order, id, false);

// Where a record's copy stands on the pipeline: finished, not begun, or at each
// stage being worked on or held up. With none of those, at each stage that can
// begin, its way there all done. A drawing that branches can be at several.
export type Place = "done" | "not_started" | { stages: string[] };

export function placeOf(stages: readonly BoardStage[], links: StageLinks): Place {
  if (stages.length === 0 || stages.every(({ status }) => status === "not_started")) {
    return "not_started";
  }
  if (stages.every(({ status }) => status === "done")) return "done";
  const active = stages.filter(
    ({ status }) => status === "in_progress" || status === "blocked",
  );
  if (active.length > 0) return { stages: active.map(({ elementId }) => elementId) };

  const order = stages.map(({ elementId }) => elementId);
  const status = new Map(stages.map((stage) => [stage.elementId, stage.status]));
  return {
    stages: stages
      .filter(
        ({ elementId, status: at }) =>
          at === "not_started" &&
          [...upstreamOf(links, order, elementId)].every(
            (before) => status.get(before) === "done",
          ),
      )
      .map(({ elementId }) => elementId),
  };
}

// The stages of a drawing in the order a client goes through them: along the
// arrows that join them, and as the boxes read on the page where no arrow decides.
export function stagesOf(elements: readonly Drawn[]): BoardStage[] {
  const boxes = readingOrder(
    elements.flatMap((element) => stageBox(element) ?? []),
  );

  const names = new Map<string, string>();
  for (const element of elements) {
    if (element.type === "text" && typeof element.containerId === "string") {
      const written = String(element.originalText ?? element.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (written) names.set(element.containerId, written.slice(0, MAX_STAGE_NAME));
    }
  }
  const after = stageLinks(elements, new Set(boxes.map(({ id }) => id)));
  const waitingOn = new Map(boxes.map((box) => [box.id, 0]));
  for (const tos of after.values()) {
    for (const to of tos) waitingOn.set(to, waitingOn.get(to)! + 1);
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
