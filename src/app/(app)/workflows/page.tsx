import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StageKind } from "@/db/schema";
import { requireOwner } from "@/lib/session";
import { listTemplates } from "@/modules/workflows/queries";
import { STARTER_TEMPLATES } from "@/modules/workflows/starters";
import { ListCard } from "../people/(lists)/list-card";
import { StarterTemplates } from "./starter-templates";

export const metadata: Metadata = { title: "Workflows" };

const either = new Intl.ListFormat("en", { type: "disjunction" });

// "Kickoff → Build → Won or Lost": the steps in order, then the ways it can end.
function inOrder(stages: readonly { name: string; kind: StageKind }[]) {
  const names = (ends: boolean) =>
    stages
      .filter((stage) => (stage.kind !== "normal") === ends)
      .map((stage) => stage.name);
  const ends = names(true);
  return [...names(false), ...(ends.length > 0 ? [either.format(ends)] : [])].join(
    " → ",
  );
}

export default async function WorkflowsPage() {
  const owner = await requireOwner();
  const templates = await listTemplates(owner.id);
  const starters = STARTER_TEMPLATES.filter(
    (starter) => !templates.some(({ starterKey }) => starterKey === starter.key),
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">
            The stages you take a client through, set up once and reused.
          </p>
        </div>
        <ButtonLink href="/workflows/new">
          <Plus aria-hidden />
          New workflow
        </ButtonLink>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflows yet. Build one of your own
          {starters.length > 0 && ", or add a starter below and change it to suit"}
          .
        </p>
      ) : (
        <ListCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead className="hidden md:table-cell">Stages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="whitespace-normal">
                    <div className="grid gap-0.5">
                      <Link
                        href={`/workflows/${template.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {template.name}
                      </Link>
                      {template.description && (
                        <p className="break-words text-muted-foreground">
                          {template.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground md:hidden">
                        {template.stages.length === 1
                          ? "1 stage"
                          : `${template.stages.length} stages`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">
                    {template.stages.length > 0
                      ? inOrder(template.stages)
                      : "No stages yet"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListCard>
      )}

      {starters.length > 0 && (
        <StarterTemplates
          starters={starters.map((starter) => ({
            key: starter.key,
            name: starter.name,
            description: starter.description,
            stages: inOrder(starter.stages),
          }))}
        />
      )}
    </div>
  );
}
