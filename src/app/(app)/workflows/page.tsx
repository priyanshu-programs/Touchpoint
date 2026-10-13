import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { requireOwner } from "@/lib/session";
import { listTemplates } from "@/modules/workflows/queries";
import { STARTER_BOARDS } from "@/modules/workflows/starters";
import { ListCard } from "../people/(lists)/list-card";
import { reorderBoardsAction } from "./actions";
import { StarterTemplates } from "./starter-templates";
import { WorkflowList } from "./workflow-list";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const owner = await requireOwner();
  const templates = await listTemplates(owner.id);
  const starters = STARTER_BOARDS.filter(
    (starter) => !templates.some(({ starterKey }) => starterKey === starter.key),
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">
            The stages you take a client through, drawn once on a whiteboard and
            reused.
          </p>
        </div>
        <ButtonLink href="/workflows/new">
          <Plus aria-hidden />
          New workflow
        </ButtonLink>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflows yet. Draw one of your own
          {starters.length > 0 && ", or add a starter below and change it to suit"}
          .
        </p>
      ) : (
        <ListCard>
          <WorkflowList
            // The list holds the order itself, so it starts again only when a
            // workflow is added or removed, not when one is moved.
            key={templates
              .map(({ id }) => id)
              .sort()
              .join(" ")}
            workflows={templates.map(({ id, name, description }) => ({
              id,
              name,
              description,
            }))}
            action={reorderBoardsAction}
          />
        </ListCard>
      )}

      {starters.length > 0 && (
        <StarterTemplates
          starters={starters.map(({ key, name, description }) => ({
            key,
            name,
            description,
          }))}
        />
      )}
    </div>
  );
}
