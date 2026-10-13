import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { getTemplate } from "@/modules/workflows/queries";
import { updateTemplateAction } from "../actions";
import { DeleteTemplate } from "../delete-template";
import { StageEditor } from "../stage-editor";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Workflow" };

const either = new Intl.ListFormat("en", { type: "disjunction" });
const count = (number: number, one: string, many: string) =>
  `${number} ${number === 1 ? one : many}`;

type Template = NonNullable<Awaited<ReturnType<typeof getTemplate>>>;

// What a stage's row says under its name: where it leads, then what it holds.
function detail(stage: Template["stages"][number], template: Template) {
  const next = template.stages.filter((other) =>
    template.edges.some(
      (edge) => edge.fromStageId === stage.id && edge.toStageId === other.id,
    ),
  );
  return [
    stage.kind !== "normal"
      ? `Ends the workflow: ${stage.kind}`
      : next.length > 0
        ? `Then ${either.format(next.map((other) => other.name))}`
        : "Leads nowhere yet",
    stage.checklist.length > 0 && `${stage.checklist.length} to tick`,
    stage.defaultTasks.length > 0 &&
      count(stage.defaultTasks.length, "task", "tasks"),
    stage.slaDays && `${count(stage.slaDays, "day", "days")} at most`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function WorkflowPage({
  params,
}: PageProps<"/workflows/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const template = await getTemplate(owner.id, id.data);
  if (!template) notFound();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Link
            href="/workflows"
            className="inline-flex items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Workflows
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {template.name}
          </h1>
        </div>
        <DeleteTemplate id={template.id} name={template.name} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Stages</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StageEditor
            templateId={template.id}
            stages={template.stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              kind: stage.kind,
              description: stage.description,
              slaDays: stage.slaDays,
              checklist: stage.checklist,
              defaultTasks: stage.defaultTasks,
              detail: detail(stage, template),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Details</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm
            action={updateTemplateAction.bind(null, template.id)}
            initial={{
              name: template.name,
              description: template.description ?? "",
            }}
            submitLabel="Save"
          />
        </CardContent>
      </Card>
    </div>
  );
}
