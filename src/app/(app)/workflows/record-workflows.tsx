import { ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";
import { SECTION_HEADING } from "@/components/detail-rows";
import { cn } from "@/lib/utils";
import { listRecordBoards, listTemplates } from "@/modules/workflows/queries";
import type { BoardSubject } from "@/modules/workflows/schema";
import { ListCard } from "../people/(lists)/list-card";
import { setBoardIconAction, setBoardStarAction } from "./actions";
import { IconPicker } from "./icon-picker";
import { StartWorkflow } from "./start-workflow";

// The Workflows tab of a record: the boards started on it, as the Workflows
// list shows workflows. Where a board stands is read on the board itself, since
// a drawing that branches has no one place it is at.
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

      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflow started yet. Start one of yours, or a blank board.
        </p>
      ) : (
        <ListCard>
          <ul aria-label="Workflows started here">
            {boards.map((board) => (
              <li
                key={board.id}
                className="flex items-start gap-2 border-b px-3 py-3 text-sm last:border-b-0"
              >
                <form action={setBoardStarAction}>
                  <input type="hidden" name="id" value={board.id} />
                  <input
                    type="hidden"
                    name="starred"
                    value={board.starred ? "0" : "1"}
                  />
                  <button
                    type="submit"
                    aria-pressed={board.starred}
                    aria-label={`Star ${board.name}`}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Star
                      aria-hidden
                      className={cn(
                        "size-4",
                        board.starred && "fill-primary text-primary",
                      )}
                    />
                  </button>
                </form>
                <IconPicker
                  name={board.name}
                  icon={board.icon}
                  action={setBoardIconAction.bind(null, board.id)}
                />
                <div className="grid min-w-0 flex-1 gap-0.5 py-0.5">
                  <Link
                    href={`/workflows/${board.id}`}
                    className="inline-flex items-center gap-1 justify-self-start font-medium underline-offset-4 hover:underline"
                  >
                    <span className="break-words">{board.name}</span>
                    <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                  </Link>
                  {board.description && (
                    <p className="break-words text-muted-foreground">
                      {board.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ListCard>
      )}
    </div>
  );
}
