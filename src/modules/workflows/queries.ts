import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  workflowTemplateEdges,
  workflowTemplates,
  workflowTemplateStages,
} from "@/db/schema";
import { MAX_TEMPLATES } from "./schema";

// The owner's workflows by name, each with its stages in order.
export async function listTemplates(ownerId: string) {
  const [templates, stages] = await Promise.all([
    db
      .select({
        id: workflowTemplates.id,
        name: workflowTemplates.name,
        description: workflowTemplates.description,
        starterKey: workflowTemplates.starterKey,
      })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.ownerId, ownerId))
      .orderBy(asc(workflowTemplates.name))
      .limit(MAX_TEMPLATES),
    db
      .select({
        templateId: workflowTemplateStages.templateId,
        name: workflowTemplateStages.name,
        kind: workflowTemplateStages.kind,
      })
      .from(workflowTemplateStages)
      .where(eq(workflowTemplateStages.ownerId, ownerId))
      .orderBy(asc(workflowTemplateStages.position)),
  ]);
  return templates.map((template) => ({
    ...template,
    stages: stages
      .filter((stage) => stage.templateId === template.id)
      .map(({ name, kind }) => ({ name, kind })),
  }));
}

export async function getTemplate(ownerId: string, id: string) {
  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.ownerId, ownerId), eq(workflowTemplates.id, id)));
  if (!template) return null;

  const [stages, edges] = await Promise.all([
    db
      .select()
      .from(workflowTemplateStages)
      .where(eq(workflowTemplateStages.templateId, id))
      .orderBy(asc(workflowTemplateStages.position)),
    db
      .select({
        fromStageId: workflowTemplateEdges.fromStageId,
        toStageId: workflowTemplateEdges.toStageId,
      })
      .from(workflowTemplateEdges)
      .where(eq(workflowTemplateEdges.templateId, id)),
  ]);
  return { ...template, stages, edges };
}
