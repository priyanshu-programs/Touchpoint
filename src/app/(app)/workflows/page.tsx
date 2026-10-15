import type { Metadata } from "next";
import { requireOwner } from "@/lib/session";
import { listTemplates } from "@/modules/workflows/queries";
import { STARTER_BOARDS } from "@/modules/workflows/starters";
import { ListCard } from "../people/(lists)/list-card";
import { reorderBoardsAction } from "./actions";
import { StarterTemplates } from "./starter-templates";
import { WorkflowList } from "./workflow-list";
import { WorkflowsHeader } from "./workflows-header";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const owner = await requireOwner();
  const templates = await listTemplates(owner.id);
  const starters = STARTER_BOARDS.filter(
    (starter) => !templates.some(({ starterKey }) => starterKey === starter.key),
  );

  return (
    <div className="grid gap-6">
      <WorkflowsHeader />

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
            workflows={templates.map(({ id, name, description, icon }) => ({
              id,
              name,
              description,
              icon,
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
