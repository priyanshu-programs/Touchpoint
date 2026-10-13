import { and, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { workflowBoards, type BoardScene } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import {
  MAX_BOARD_STAGES,
  MAX_TEMPLATES,
  type BoardInput,
  type SceneSave,
} from "./schema";
import { stagesOf } from "./stages";
import { STARTER_BOARDS, starterScene } from "./starters";

export type BoardResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "limit" | "name_taken" | "already_added" | "not_found";
    };

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const owned = (ownerId: string, id: string) =>
  and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, id));

// A template belongs to no company and no person.
const isTemplate = and(
  isNull(workflowBoards.organizationId),
  isNull(workflowBoards.contactId),
);

// Held for the length of a change, so two saves of one workflow cannot interleave.
async function lockBoard(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({
      name: workflowBoards.name,
      description: workflowBoards.description,
      version: workflowBoards.version,
      stages: workflowBoards.stages,
      organizationId: workflowBoards.organizationId,
      contactId: workflowBoards.contactId,
    })
    .from(workflowBoards)
    .where(owned(ownerId, id))
    .for("update");
  return row;
}

const templateNames = (tx: Tx, ownerId: string) =>
  tx
    .select({ id: workflowBoards.id, name: workflowBoards.name })
    .from(workflowBoards)
    .where(and(eq(workflowBoards.ownerId, ownerId), isTemplate));

async function insertTemplate(
  tx: Tx,
  ownerId: string,
  input: BoardInput,
  starterKey: string | null,
  scene: BoardScene,
): Promise<BoardResult> {
  const existing = await templateNames(tx, ownerId);
  if (existing.length >= MAX_TEMPLATES) return { ok: false, reason: "limit" };
  if (existing.some(({ name }) => sameText(name, input.name))) {
    return { ok: false, reason: "name_taken" };
  }
  const stages = stagesOf(scene.elements);
  const [row] = await tx
    .insert(workflowBoards)
    .values({ ownerId, ...input, starterKey, scene, stages })
    .returning({ id: workflowBoards.id });
  await audit(tx, {
    ownerId,
    actor: "user",
    action: "workflow.create",
    entityType: "workflow",
    entityId: row.id,
    after: { ...input, starterKey, stages: stages.map(({ name }) => name) },
  });
  return { ok: true, id: row.id };
}

export async function createBoard(
  ownerId: string,
  input: BoardInput,
): Promise<BoardResult> {
  return db.transaction((tx) =>
    insertTemplate(tx, ownerId, input, null, { elements: [] }),
  );
}

// The workflow is the one this app offers under that key, whatever else was sent.
export async function addStarterBoard(
  ownerId: string,
  key: string,
): Promise<BoardResult> {
  const starter = STARTER_BOARDS.find((board) => board.key === key);
  if (!starter) return { ok: false, reason: "not_found" };

  return db.transaction(async (tx) => {
    const [added] = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(
        and(
          eq(workflowBoards.ownerId, ownerId),
          eq(workflowBoards.starterKey, key),
          isTemplate,
        ),
      );
    if (added) return { ok: false, reason: "already_added" };

    return insertTemplate(
      tx,
      ownerId,
      { name: starter.name, description: starter.description },
      key,
      starterScene(starter),
    );
  });
}

export async function updateBoard(
  ownerId: string,
  id: string,
  input: BoardInput,
): Promise<BoardResult> {
  return db.transaction(async (tx) => {
    const before = await lockBoard(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    // Only templates are told apart by name; a company's copy keeps its template's.
    if (!before.organizationId && !before.contactId) {
      const existing = await templateNames(tx, ownerId);
      if (
        existing.some(
          (other) => other.id !== id && sameText(other.name, input.name),
        )
      ) {
        return { ok: false, reason: "name_taken" };
      }
    }

    await tx.update(workflowBoards).set(input).where(owned(ownerId, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.update",
      entityType: "workflow",
      entityId: id,
      before: { name: before.name, description: before.description },
      after: input,
    });
    return { ok: true, id };
  });
}

export async function deleteBoard(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockBoard(tx, ownerId, id);
    if (!before) return false;
    await tx.delete(workflowBoards).where(owned(ownerId, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.delete",
      entityType: "workflow",
      entityId: id,
      before: {
        name: before.name,
        description: before.description,
        stages: before.stages.map(({ name }) => name),
      },
    });
    return true;
  });
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: "not_found" | "conflict" | "stage_limit" };

// The drawing as the whiteboard holds it now, replacing the one stored. It is
// taken only from the version the whiteboard loaded, so a drawing open in two
// places cannot silently lose what the other one drew. Not audited: a drawing is
// saved every few seconds while it is being worked on.
export async function saveScene(
  ownerId: string,
  id: string,
  { version, elements }: SceneSave,
): Promise<SaveResult> {
  const marked = elements.filter(({ customData }) => customData?.stage).length;
  if (marked > MAX_BOARD_STAGES) return { ok: false, reason: "stage_limit" };

  return db.transaction(async (tx) => {
    const before = await lockBoard(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (before.version !== version) return { ok: false, reason: "conflict" };

    await tx
      .update(workflowBoards)
      .set({
        scene: { elements },
        stages: stagesOf(elements),
        version: version + 1,
      })
      .where(owned(ownerId, id));
    return { ok: true, version: version + 1 };
  });
}
