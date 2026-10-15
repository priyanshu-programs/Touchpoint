import type { Metadata } from "next";
import { requireOwner } from "@/lib/session";
import { listPipeline, listTemplates } from "@/modules/workflows/queries";
import { MAX_PIPELINE_CARDS, pipelineParams } from "@/modules/workflows/schema";
import { placeOf, stageLinks } from "@/modules/workflows/stages";
import { WorkflowsHeader } from "../workflows-header";
import {
  PipelineBoard,
  WorkflowPicker,
  type PipelineCard,
  type PipelineColumn,
} from "./pipeline-board";

export const metadata: Metadata = { title: "Pipeline" };

// A stage's column is told apart from Not started and Done by a prefix, so a
// stage whose whiteboard id happens to be "done" is still its own column.
const stageKey = (elementId: string) => `stage:${elementId}`;

export default async function PipelinePage({
  searchParams,
}: PageProps<"/workflows/pipeline">) {
  const owner = await requireOwner();
  const { workflow } = pipelineParams.parse(await searchParams);
  const templates = await listTemplates(owner.id);
  const chosen =
    templates.find(({ id }) => id === workflow) ?? templates.at(0) ?? null;
  const pipeline = chosen && (await listPipeline(owner.id, chosen.id));

  return (
    <div className="grid min-w-0 gap-6">
      <WorkflowsHeader />

      {!chosen || !pipeline ? (
        <p className="text-sm text-muted-foreground">
          No workflows yet. Draw one, start it on a company or a person, and its
          pipeline shows here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <WorkflowPicker
              chosen={chosen.id}
              workflows={templates.map(({ id, name, icon }) => ({
                id,
                name,
                icon,
                href: `/workflows/pipeline?workflow=${id}`,
              }))}
            />
            <p className="text-sm text-muted-foreground">
              {pipeline.more
                ? `Showing the first ${MAX_PIPELINE_CARDS}`
                : pipeline.boards.length === 1
                  ? "1 started"
                  : `${pipeline.boards.length} started`}
            </p>
          </div>
          {pipeline.boards.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {chosen.name} has not been started on anyone yet. Start it from a
              company&apos;s or a person&apos;s Workflows tab.
            </p>
          )}
          <PipelineBoard
            key={chosen.id}
            columns={columnsOf(pipeline.stages)}
            cards={pipeline.boards.map((board) => cardOf(board, pipeline.stages))}
          />
        </>
      )}
    </div>
  );
}

function columnsOf(stages: { elementId: string; name: string }[]): PipelineColumn[] {
  return [
    { key: "not_started", name: "Not started" },
    ...stages.map(({ elementId, name }) => ({ key: stageKey(elementId), name })),
    { key: "done", name: "Done" },
  ];
}

type Board = NonNullable<Awaited<ReturnType<typeof listPipeline>>>["boards"][number];

// Where a copy goes: the columns of the workflow's stages it is at, and by name
// the stages it is at that the copy drew for itself and the workflow has not.
function cardOf(board: Board, workflowStages: { elementId: string }[]): PipelineCard {
  const onWorkflow = new Set(workflowStages.map(({ elementId }) => elementId));
  const own = board.stages.map(({ elementId }) => elementId);
  const place = placeOf(board.stages, stageLinks(board.arrows, new Set(own)));
  const at =
    typeof place === "string"
      ? { columns: [place], elsewhere: [] }
      : {
          columns: place.stages.filter((id) => onWorkflow.has(id)).map(stageKey),
          elsewhere: place.stages
            .filter((id) => !onWorkflow.has(id))
            .map((id) => board.stages.find(({ elementId }) => elementId === id)!.name),
        };
  return {
    id: board.id,
    icon: board.icon,
    record: board.record,
    blocked: board.stages.some(({ status }) => status === "blocked"),
    ...at,
    // The workflow's stages this copy still has, the only ones it can be moved to.
    targets: own.filter((id) => onWorkflow.has(id)).map(stageKey),
  };
}
