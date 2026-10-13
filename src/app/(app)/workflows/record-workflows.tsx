import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { SECTION_HEADING } from "@/components/detail-rows";
import {
  STAGE_LABELS,
  STAGE_MARKS,
  STAGE_ORDER,
} from "@/modules/workflows/drawing";
import { listRecordBoards, listTemplates } from "@/modules/workflows/queries";
import type { BoardSubject } from "@/modules/workflows/schema";
import { progressOf } from "@/modules/workflows/stages";
import { StatusMenu } from "../people/(lists)/status-menu";
import { setStageStatusAction } from "./actions";
import { StartWorkflow } from "./start-workflow";

const STATUS_OPTIONS = STAGE_ORDER.map((status) => ({
  value: status,
  label: STAGE_LABELS[status],
  color: STAGE_MARKS[status],
}));

// The Workflows tab of a record: the boards started on it, where each stands,
// and every stage with a status that can be changed without opening the board.
export async function RecordWorkflows({
  ownerId,
  subject,
}: {
  ownerId: string;
  subject: BoardSubject;
}) {
  const [boards, templates] = await Promise.all([
    listRecordBoards(ownerId, subject),
    listTemplates(ownerId),
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={SECTION_HEADING}>Workflows</h3>
        <StartWorkflow
          subject={subject}
          templates={templates.map(({ id, name }) => ({ id, name }))}
        />
      </div>

      {boards.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No workflow started yet. Start one of yours, or a blank board.
        </p>
      )}

      {boards.map((board) => {
        const { done, total, current, blocked } = progressOf(board.stages);
        return (
          <section
            key={board.id}
            aria-label={board.name}
            className="grid gap-3 rounded-xl border bg-card p-4 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <Link
                  href={`/workflows/${board.id}`}
                  className="inline-flex items-center gap-1 justify-self-start font-medium underline-offset-4 hover:underline"
                >
                  <span className="break-words">{board.name}</span>
                  <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                </Link>
                {total === 0 ? (
                  <p className="text-muted-foreground">
                    No stages yet. Open the board and make a box a stage.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {done} of {total} done
                    {current && ` · Now: ${current}`}
                  </p>
                )}
                {blocked.length > 0 && (
                  <p className="text-destructive">
                    Blocked: {blocked.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {total > 0 && (
              <ol className="grid gap-1">
                {board.stages.map((stage) => (
                  <li
                    key={stage.elementId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 break-words">{stage.name}</span>
                    <StatusMenu
                      label={`Status of ${stage.name}`}
                      value={stage.status}
                      options={STATUS_OPTIONS}
                      action={setStageStatusAction.bind(
                        null,
                        board.id,
                        stage.elementId,
                      )}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
