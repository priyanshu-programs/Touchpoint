import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  contacts,
  organizations,
  workflowBoards,
  type BoardScene,
} from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles } from "@/modules/files/service";
import { copyAttachments } from "./attachments";
import {
  MAX_BOARD_STAGES,
  MAX_RECORD_BOARDS,
  MAX_TEMPLATES,
  type BoardInput,
  type BoardStart,
  type BoardSubject,
  type SceneSave,
  type StageChange,
} from "./schema";
import { atStatus, isStage, stagesOf } from "./stages";
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
    .select({
      id: workflowBoards.id,
      name: workflowBoards.name,
      position: workflowBoards.position,
    })
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
  // A new workflow goes to the end of the owner's list.
  const position = Math.max(-1, ...existing.map((other) => other.position)) + 1;
  const [row] = await tx
    .insert(workflowBoards)
    .values({ ownerId, ...input, starterKey, scene, stages, position })
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
    // What its boxes carried went with it; a file nothing else points at goes too.
    await dropUnusedFiles(tx, ownerId);
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

// The owner's workflows in the order given. The list has to be exactly theirs,
// each once, so nothing else can be moved and none is left without a place.
export async function reorderTemplates(ownerId: string, ids: string[]) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), isTemplate))
      .for("update");
    const before = existing.map(({ id }) => id);
    if (
      before.length !== ids.length ||
      !ids.every((id) => before.includes(id))
    ) {
      return false;
    }

    const place = sql.join(
      ids.map((id, index) => sql`when ${id}::uuid then ${index}::int`),
      sql` `,
    );
    await tx
      .update(workflowBoards)
      .set({ position: sql`case ${workflowBoards.id} ${place} end` })
      .where(
        and(eq(workflowBoards.ownerId, ownerId), inArray(workflowBoards.id, ids)),
      );
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.reorder",
      entityType: "workflow",
      after: ids,
    });
    return true;
  });
}

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "limit" };

const ofSubject = (subject: BoardSubject) =>
  "organizationId" in subject
    ? eq(workflowBoards.organizationId, subject.organizationId)
    : eq(workflowBoards.contactId, subject.contactId);

// Held while a board is started on it, so the record's limit cannot be passed
// by two at once. Nothing is found for a record that is not the owner's.
async function lockSubject(tx: Tx, ownerId: string, subject: BoardSubject) {
  const [row] =
    "organizationId" in subject
      ? await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            and(
              eq(organizations.ownerId, ownerId),
              eq(organizations.id, subject.organizationId),
            ),
          )
          .for("update")
      : await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(eq(contacts.ownerId, ownerId), eq(contacts.id, subject.contactId)),
          )
          .for("update");
  return row;
}

// A record's own board: a copy of one of the owner's workflows with every stage
// not started, or an empty one. The copy keeps the workflow's element ids, so
// its stages can be lined up with the workflow's, and is its own drawing from
// then on: nothing done to either reaches the other.
export async function startBoard(
  ownerId: string,
  subject: BoardSubject,
  from: BoardStart,
): Promise<StartResult> {
  return db.transaction(async (tx) => {
    if (!(await lockSubject(tx, ownerId, subject))) {
      return { ok: false, reason: "not_found" };
    }
    const running = await tx
      .select({ id: workflowBoards.id })
      .from(workflowBoards)
      .where(and(eq(workflowBoards.ownerId, ownerId), ofSubject(subject)));
    if (running.length >= MAX_RECORD_BOARDS) return { ok: false, reason: "limit" };

    let values: {
      name: string;
      description: string | null;
      scene: BoardScene;
      sourceBoardId: string | null;
    };
    if ("templateId" in from) {
      const [template] = await tx
        .select({
          name: workflowBoards.name,
          description: workflowBoards.description,
          scene: workflowBoards.scene,
        })
        .from(workflowBoards)
        .where(and(owned(ownerId, from.templateId), isTemplate));
      if (!template) return { ok: false, reason: "not_found" };
      values = {
        name: template.name,
        description: template.description,
        scene: {
          elements: template.scene.elements.map((element) =>
            isStage(element) ? atStatus(element, "not_started") : element,
          ),
        },
        sourceBoardId: from.templateId,
      };
    } else {
      values = { ...from, scene: { elements: [] }, sourceBoardId: null };
    }

    const [row] = await tx
      .insert(workflowBoards)
      .values({
        ownerId,
        ...subject,
        ...values,
        stages: stagesOf(values.scene.elements),
      })
      .returning({ id: workflowBoards.id });
    if (values.sourceBoardId) {
      await copyAttachments(tx, ownerId, {
        from: values.sourceBoardId,
        to: row.id,
        boxes: new Set(values.scene.elements.map(({ id }) => String(id))),
      });
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.start",
      entityType: "workflow",
      entityId: row.id,
      after: {
        name: values.name,
        sourceBoardId: values.sourceBoardId,
        ...subject,
      },
    });
    return { ok: true, id: row.id };
  });
}

// One stage of a record's board, changed without opening the drawing: that box
// takes the status and its colour, and nothing else of the drawing is touched.
// The version moves on, so a whiteboard that has this board open stops saving
// over the change and says so.
export async function setStageStatus(
  ownerId: string,
  { boardId, elementId, status }: StageChange,
) {
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({
        scene: workflowBoards.scene,
        stages: workflowBoards.stages,
        version: workflowBoards.version,
        organizationId: workflowBoards.organizationId,
        contactId: workflowBoards.contactId,
      })
      .from(workflowBoards)
      .where(owned(ownerId, boardId))
      .for("update");
    // A status means something only on a record's own board.
    if (!board || (!board.organizationId && !board.contactId)) return false;
    const before = board.stages.find((stage) => stage.elementId === elementId);
    if (!before) return false;
    if (before.status === status) return true;

    const elements = board.scene.elements.map((element) =>
      element.id === elementId && isStage(element)
        ? atStatus(element, status)
        : element,
    );
    await tx
      .update(workflowBoards)
      .set({
        scene: { elements },
        stages: stagesOf(elements),
        version: board.version + 1,
      })
      .where(owned(ownerId, boardId));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "workflow.stage_status",
      entityType: "workflow",
      entityId: boardId,
      before: { stage: before.name, status: before.status },
      after: { status },
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
