"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import {
  addLink,
  openAttachments,
  removeAttachment,
} from "@/modules/workflows/attachments";
import {
  addStarterBoard,
  createBoard,
  deleteBoard,
  reorderTemplates,
  setBoardIcon,
  starBoard,
  startBoard,
  updateBoard,
  type BoardResult,
} from "@/modules/workflows/boards";
import type { BoxAttachment, BoxNote } from "@/modules/workflows/drawing";
import { addNote, openNotes, removeNote } from "@/modules/workflows/notes";
import { openPictures } from "@/modules/workflows/pictures";
import { getBoard } from "@/modules/workflows/queries";
import {
  attachmentRef,
  boardIcon,
  boardInput,
  boardOrder,
  boardStar,
  boardSubject,
  boxLink,
  boxRef,
  MAX_RECORD_BOARDS,
  MAX_TEMPLATES,
  noteBody,
  noteRef,
} from "@/modules/workflows/schema";
import { STARTER_BOARDS } from "@/modules/workflows/starters";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { ATTACH_REFUSALS, NOTE_REFUSALS } from "./attach-messages";

function failure(
  result: Exclude<BoardResult, { ok: true }>,
  name: string,
  values?: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  const message = {
    limit: `You can have at most ${MAX_TEMPLATES} workflows.`,
    name_taken: `There is already a workflow called ${name}.`,
    already_added: `${name} is already among your workflows.`,
  }[result.reason];
  return { ok: false, message, values };
}

// A board shows in the Workflows list and in the panel of the record it is on.
function revalidateBoards() {
  revalidatePath("/workflows", "layout");
  revalidatePath("/people", "layout");
}

const FULL = `A record can have at most ${MAX_RECORD_BOARDS} workflows.`;

export async function createBoardAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = boardInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createBoard(owner.id, parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidatePath("/workflows", "layout");
  redirect(`/workflows/${result.id}`);
}

// The form names a starter by its key; what the workflow is comes from the server's list.
export async function addStarterBoardAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const key = z.string().max(60).parse(formData.get("key"));
  const result = await addStarterBoard(owner.id, key);
  if (!result.ok) {
    return failure(
      result,
      STARTER_BOARDS.find((starter) => starter.key === key)?.name ?? key,
    );
  }

  revalidatePath("/workflows", "layout");
  return { ok: true, message: "Workflow added." };
}

export async function updateBoardAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = boardInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateBoard(owner.id, z.uuid().parse(id), parsed.data);
  if (!result.ok) return failure(result, parsed.data.name, values);

  revalidateBoards();
  return { ok: true, message: "Saved." };
}

// A record's board goes back to that record's Workflows tab, which is worked out
// from the board as stored and never from an address the browser sent.
export async function deleteBoardAction(formData: FormData) {
  const owner = await requireOwner();
  const id = z.uuid().parse(formData.get("id"));
  const board = await getBoard(owner.id, id);
  if (!board || !(await deleteBoard(owner.id, id))) notFound();
  revalidateBoards();
  redirect(
    board.organizationId
      ? companyHref(board.organizationId, "workflows")
      : board.contactId
        ? contactHref(board.contactId, "workflows")
        : "/workflows",
  );
}

export async function reorderBoardsAction(ids: string[]) {
  const owner = await requireOwner();
  if (!(await reorderTemplates(owner.id, boardOrder.parse(ids)))) notFound();
  revalidatePath("/workflows", "layout");
}

// A copy of one of the owner's workflows, started on a company or a person.
export async function startWorkflowAction(
  subject: unknown,
  templateId: string,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const result = await startBoard(owner.id, boardSubject.parse(subject), {
    templateId: z.uuid().parse(templateId),
  });
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { ok: false, message: FULL };
  }
  revalidatePath("/people", "layout");
  return { ok: true, message: "Workflow started." };
}

// An empty board on a company or a person, opened at once to be drawn on.
export async function startBlankBoardAction(
  subject: unknown,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, ["name", "description"]);
  const parsed = boardInput.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await startBoard(
    owner.id,
    boardSubject.parse(subject),
    parsed.data,
  );
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { ok: false, message: FULL, values };
  }
  revalidatePath("/people", "layout");
  redirect(`/workflows/${result.id}`);
}

// What is kept apart from a board's drawing, asked for as its whiteboard opens:
// what its boxes carry, and the ids of the pictures drawn on it.
export async function openBoardAction(boardId: string) {
  const owner = await requireOwner();
  const id = z.uuid().parse(boardId);
  const attachments = await openAttachments(owner.id, id);
  const pictures = attachments && (await openPictures(owner.id, id));
  const notes = pictures && (await openNotes(owner.id, id));
  if (!attachments || !pictures || !notes) notFound();
  return { attachments, pictures, notes };
}

export type NoteOutcome =
  | { ok: true; notes: BoxNote[] }
  | { ok: false; message: string };

export async function addNoteAction(box: unknown, body: string): Promise<NoteOutcome> {
  const owner = await requireOwner();
  const parsed = noteBody.safeParse(body);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const result = await addNote(owner.id, boxRef.parse(box), parsed.data);
  if (result.ok) return result;
  if (result.reason === "not_found") notFound();
  return { ok: false, message: NOTE_REFUSALS[result.reason] };
}

export async function removeNoteAction(boardId: string, noteId: string) {
  const owner = await requireOwner();
  return (await removeNote(owner.id, noteRef.parse({ boardId, noteId }))) ?? notFound();
}

export type AttachOutcome =
  | { ok: true; attachments: BoxAttachment[] }
  | { ok: false; message: string };

export async function addBoxLinkAction(
  box: unknown,
  link: { title: string; url: string },
): Promise<AttachOutcome> {
  const owner = await requireOwner();
  const address = String(link.url).trim();
  const parsed = boxLink.safeParse({
    title: link.title,
    // An address typed without its start is taken as a web address, and as
    // nothing else: with the start put on, no other kind of link can be read.
    url: /^https?:\/\//i.test(address) ? address : `https://${address}`,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const result = await addLink(owner.id, boxRef.parse(box), parsed.data);
  if (result.ok) return result;
  if (result.reason === "not_found") notFound();
  return { ok: false, message: ATTACH_REFUSALS[result.reason] };
}

export async function removeAttachmentAction(boardId: string, attachmentId: string) {
  const owner = await requireOwner();
  return (
    (await removeAttachment(
      owner.id,
      attachmentRef.parse({ boardId, attachmentId }),
    )) ?? notFound()
  );
}

export async function setBoardIconAction(boardId: string, icon: string | null) {
  const owner = await requireOwner();
  if (!(await setBoardIcon(owner.id, boardIcon.parse({ boardId, icon })))) {
    notFound();
  }
  revalidateBoards();
}

export async function setBoardStarAction(formData: FormData) {
  const owner = await requireOwner();
  const { id, starred } = boardStar.parse(readFields(formData, ["id", "starred"]));
  if (!(await starBoard(owner.id, id, starred === "1"))) notFound();
  revalidatePath("/people", "layout");
}
