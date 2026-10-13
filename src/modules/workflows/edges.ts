import type { StageKind } from "@/db/schema";

// The paths of a workflow kept as an ordered list: each stage leads to the next,
// the last one to every stage that ends the workflow well, and any stage can be
// lost from. End stages lead nowhere. `stages` is in the order the owner gave it.
export function linearEdges(stages: { id: string; kind: StageKind }[]) {
  const steps = stages.filter((stage) => stage.kind === "normal");
  return steps.flatMap((step, index) => {
    const next = steps[index + 1];
    const ends = stages.filter(
      (stage) =>
        stage.kind === "lost" || (!next && stage.kind !== "normal"),
    );
    return [...(next ? [next] : []), ...ends].map((to) => ({
      fromStageId: step.id,
      toStageId: to.id,
    }));
  });
}
