import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { workflowBoards } from "@/db/schema";
import { MAX_TEMPLATES } from "./schema";

// The owner's workflows by name, each with its stages in order. A company's or
// a person's own copy is not among them.
export async function listTemplates(ownerId: string) {
  return db
    .select({
      id: workflowBoards.id,
      name: workflowBoards.name,
      description: workflowBoards.description,
      starterKey: workflowBoards.starterKey,
      stages: workflowBoards.stages,
    })
    .from(workflowBoards)
    .where(
      and(
        eq(workflowBoards.ownerId, ownerId),
        isNull(workflowBoards.organizationId),
        isNull(workflowBoards.contactId),
      ),
    )
    .orderBy(asc(workflowBoards.name))
    .limit(MAX_TEMPLATES);
}

export async function getBoard(ownerId: string, id: string) {
  const [board] = await db
    .select()
    .from(workflowBoards)
    .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, id)));
  return board ?? null;
}
