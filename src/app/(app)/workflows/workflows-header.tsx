import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { TabNav } from "@/components/tab-nav";

const TABS = [
  { href: "/workflows", label: "Workflows" },
  { href: "/workflows/pipeline", label: "Pipeline" },
] as const;

export function WorkflowsHeader() {
  return (
    <div className="grid gap-4">
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
      <TabNav label="Workflows" tabs={TABS} />
    </div>
  );
}
