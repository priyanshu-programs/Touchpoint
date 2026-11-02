import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contacts, organizations, workflowNotes } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { deleteContact } from "@/modules/contacts/service";
import { deleteOrganization } from "@/modules/organizations/service";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { createBoard, deleteBoard, saveScene, startBoard } from "./boards";
import { attachmentKind, MAX_NOTE_LENGTH } from "./drawing";
import { MAX_NOTE_MARKS, type NoteMark } from "./note-marks";
import { addNote, editNote, openNotes, removeNote } from "./notes";
import { MAX_BOARD_NOTES, noteBody, noteInput, noteRef, sceneSave } from "./schema";

const box = (id: string) => ({ id, type: "rectangle", x: 0, y: 0, width: 100, height: 60 });
const refused = (reason: string) => ({ ok: false, reason });

describe("attachmentKind", () => {
  const file = (contentType: string) => ({
    id: "1",
    elementId: "a",
    title: "x",
    url: null,
    size: 1,
    contentType,
  });

  it.each([
    ["application/pdf", "pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "word"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "excel"],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "powerpoint",
    ],
    ["image/png", "picture"],
    ["image/webp", "picture"],
    ["application/zip", "file"],
  ])("reads %s as %s", (contentType, kind) => {
    expect(attachmentKind(file(contentType))).toBe(kind);
  });

  it("reads anything with an address as a link", () => {
    expect(
      attachmentKind({ ...file("application/pdf"), url: "https://a.test" }),
    ).toBe("link");
  });
});

describe("noteBody", () => {
  it("keeps a note trimmed, line breaks and all", () => {
    expect(noteBody.parse("  Call on Monday\nthen send the quote  ")).toBe(
      "Call on Monday\nthen send the quote",
    );
    expect(noteBody.parse("x".repeat(MAX_NOTE_LENGTH))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it.each([
    ["an empty note", ""],
    ["only spaces", "   \n "],
    ["a note over the length", "x".repeat(MAX_NOTE_LENGTH + 1)],
    ["something not text", 5],
  ])("rejects %s", (_label, value) => {
    expect(noteBody.safeParse(value).success).toBe(false);
  });

  it("names a note by a board's id and the note's", () => {
    const boardId = crypto.randomUUID();
    const noteId = crypto.randomUUID();
    expect(noteRef.safeParse({ boardId, noteId }).success).toBe(true);
    expect(noteRef.safeParse({ boardId, noteId: "1" }).success).toBe(false);
    expect(noteRef.safeParse({ boardId, noteId, ownerId: "x" }).success).toBe(false);
  });
});

describe("noteInput", () => {
  it("moves the formatting with the words when the spaces around them go", () => {
    expect(
      noteInput.parse({
        body: "  Call Maple Studio  ",
        marks: [
          { from: 2, to: 6, style: "bold" },
          { from: 0, to: 30, style: "italic" },
        ],
      }),
    ).toEqual({
      body: "Call Maple Studio",
      marks: [
        { from: 0, to: 4, style: "bold" },
        { from: 0, to: 17, style: "italic" },
      ],
    });
  });

  it("joins a style's overlapping marks and drops empty ones", () => {
    expect(
      noteInput.parse({
        body: "Quote sent",
        marks: [
          { from: 6, to: 10, style: "underline" },
          { from: 0, to: 3, style: "underline" },
          { from: 2, to: 6, style: "underline" },
          { from: 4, to: 4, style: "bold" },
        ],
      }).marks,
    ).toEqual([{ from: 0, to: 10, style: "underline" }]);
  });

  it.each([
    ["an empty note", { body: "  ", marks: [] }],
    ["a style it does not know", { body: "x", marks: [{ from: 0, to: 1, style: "script" }] }],
    ["a mark with more fields", { body: "x", marks: [{ from: 0, to: 1, style: "bold", href: "x" }] }],
    ["a mark not in whole characters", { body: "xy", marks: [{ from: 0.5, to: 1, style: "bold" }] }],
    [
      "too many marks",
      {
        body: "x",
        marks: Array.from({ length: MAX_NOTE_MARKS + 1 }, () => ({ from: 0, to: 1, style: "bold" })),
      },
    ],
    ["a note with more fields", { body: "x", marks: [], html: "<b>x</b>" }],
    ["a note over the length", { body: "x".repeat(MAX_NOTE_LENGTH + 1), marks: [] }],
  ])("rejects %s", (_label, value) => {
    expect(noteInput.safeParse(value).success).toBe(false);
  });

  it("says why a note is refused", () => {
    expect(noteInput.safeParse({ body: " ", marks: [] }).error?.issues[0].message).toBe(
      "Write something in the note first.",
    );
  });
});

describe("notes on a box", () => {
  let ownerId: string;
  let boardId: string;

  // A workflow whose stored drawing has the boxes `a` and `b` and an arrow.
  const drawn = async (name: string, owner = ownerId) => {
    const created = await createBoard(owner, { name, description: null });
    if (!created.ok) throw new Error(created.reason);
    await saveScene(
      owner,
      created.id,
      sceneSave.parse({
        version: 1,
        elements: [box("a"), box("b"), { id: "line", type: "arrow" }],
      }),
    );
    return created.id;
  };

  const noted = async (id = boardId) => {
    const notes = await openNotes(ownerId, id);
    if (!notes) throw new Error("no board");
    return notes;
  };
  const note = (elementId: string, body: string, id = boardId, marks: NoteMark[] = []) =>
    addNote(ownerId, { boardId: id, elementId }, { body, marks });

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    boardId = await drawn("Onboarding");
  });

  it("puts notes on a box, the oldest first, each with its time", async () => {
    expect(await note("a", "Call on Monday")).toEqual({
      ok: true,
      notes: [
        {
          id: expect.any(String),
          elementId: "a",
          body: "Call on Monday",
          marks: [],
          createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        },
      ],
    });
    await note("a", "<b>Quote</b> sent");
    await note("b", "Waiting on the signature");
    expect((await noted()).map(({ elementId, body }) => [elementId, body])).toEqual([
      ["a", "Call on Monday"],
      ["a", "<b>Quote</b> sent"],
      ["b", "Waiting on the signature"],
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.note_add",
      entityId: boardId,
      after: { elementId: "b", body: "Waiting on the signature" },
    });
  });

  it("puts a note only on a box of the drawing as stored", async () => {
    expect(await note("line", "x")).toEqual(refused("no_box"));
    expect(await note("not-drawn", "x")).toEqual(refused("no_box"));
    expect(await note("a", "x", crypto.randomUUID())).toEqual(refused("not_found"));
    expect(await noted()).toEqual([]);
  });

  it("stops at the most notes a whiteboard can carry", async () => {
    await db.insert(workflowNotes).values(
      Array.from({ length: MAX_BOARD_NOTES }, (_, index) => ({
        ownerId,
        boardId,
        elementId: "a",
        body: `Note ${index}`,
      })),
    );
    expect(await note("b", "One more")).toEqual(refused("limit"));
    // Another board has room of its own.
    expect((await note("a", "Elsewhere", await drawn("Offboarding"))).ok).toBe(true);
  });

  it("removes a note and says so", async () => {
    await note("a", "Keep");
    const added = await note("a", "Drop");
    if (!added.ok) throw new Error(added.reason);
    const noteId = added.notes[1].id;

    expect((await removeNote(ownerId, { boardId, noteId }))?.map(({ body }) => body)).toEqual(
      ["Keep"],
    );
    expect(await removeNote(ownerId, { boardId, noteId })).toBeNull();
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.note_remove",
      before: { elementId: "a", body: "Drop" },
    });
  });

  it("keeps a note's formatting, and changes its words and formatting, and says so", async () => {
    const bold = { from: 0, to: 5, style: "bold" } as const;
    const added = await note("a", "Quote sent", boardId, [bold]);
    if (!added.ok) throw new Error(added.reason);
    const noteId = added.notes[0].id;
    expect((await noted())[0].marks).toEqual([bold]);

    const italic = { from: 6, to: 10, style: "italic" } as const;
    const edited = await editNote(
      ownerId,
      { boardId, noteId },
      { body: "Quote sent today", marks: [italic] },
    );
    expect(edited).toEqual([
      expect.objectContaining({ id: noteId, body: "Quote sent today", marks: [italic] }),
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.note_edit",
      entityId: boardId,
      before: { body: "Quote sent", marks: [bold] },
      after: { body: "Quote sent today", marks: [italic] },
    });
    expect(
      await editNote(ownerId, { boardId, noteId: crypto.randomUUID() }, { body: "x", marks: [] }),
    ).toBeNull();
  });

  it("drops a deleted box's notes when the whiteboard is next opened", async () => {
    await note("a", "Stays");
    await note("b", "Goes");

    await saveScene(ownerId, boardId, sceneSave.parse({ version: 2, elements: [box("a")] }));
    // Nothing goes with the save: an undo could still bring the box back.
    expect(
      await db
        .select({ id: workflowNotes.id })
        .from(workflowNotes)
        .where(eq(workflowNotes.boardId, boardId)),
    ).toHaveLength(2);

    expect((await noted()).map(({ body }) => body)).toEqual(["Stays"]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      actor: "system",
      action: "workflow.notes_dropped",
      before: ["Goes"],
    });
  });

  describe("on a company and a person", () => {
    let organizationId: string;
    let contactId: string;

    const start = async (subject: Parameters<typeof startBoard>[1]) => {
      const started = await startBoard(ownerId, subject, { templateId: boardId });
      if (!started.ok) throw new Error(started.reason);
      return started.id;
    };
    const rows = () => db.select({ id: workflowNotes.id }).from(workflowNotes);

    beforeEach(async () => {
      [{ id: organizationId }] = await db
        .insert(organizations)
        .values({ ownerId, name: "Acme" })
        .returning({ id: organizations.id });
      [{ id: contactId }] = await db
        .insert(contacts)
        .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
        .returning({ id: contacts.id });
      await note("a", "Kickoff call", boardId, [{ from: 0, to: 7, style: "bold" }]);
      await note("b", "Send the contract");
    });

    it("copies the notes with their times, and keeps the copies apart", async () => {
      // A note on a box no longer in the drawing is not copied.
      await db
        .insert(workflowNotes)
        .values({ ownerId, boardId, elementId: "gone", body: "Old" });
      const copy = await start({ organizationId });
      const sibling = await start({ contactId });

      const copied = await noted(copy);
      expect(copied.map(({ elementId, body }) => [elementId, body])).toEqual([
        ["a", "Kickoff call"],
        ["b", "Send the contract"],
      ]);
      expect(copied[0].marks).toEqual([{ from: 0, to: 7, style: "bold" }]);
      expect(copied.map(({ createdAt }) => createdAt)).toEqual(
        (await noted()).map(({ createdAt }) => createdAt),
      );

      await removeNote(ownerId, { boardId: copy, noteId: copied[0].id });
      await note("a", "Only on the copy", copy);
      expect((await noted(copy)).map(({ body }) => body)).toEqual([
        "Send the contract",
        "Only on the copy",
      ]);
      expect((await noted()).map(({ body }) => body)).toEqual([
        "Kickoff call",
        "Send the contract",
      ]);
      expect(await noted(sibling)).toHaveLength(2);
    });

    it("goes with its board, by itself or with its record", async () => {
      await start({ organizationId });
      await start({ contactId });
      expect(await rows()).toHaveLength(6);

      await deleteOrganization(ownerId, organizationId);
      expect(await rows()).toHaveLength(4);
      await deleteContact(ownerId, contactId);
      expect(await rows()).toHaveLength(2);
      await deleteBoard(ownerId, boardId);
      expect(await rows()).toEqual([]);
    });
  });

  it("keeps another owner away from a board's notes", async () => {
    const added = await note("a", "Private");
    if (!added.ok) throw new Error(added.reason);
    const [{ id: noteId }] = added.notes;
    const stranger = await createTestOwner("stranger@example.com");

    expect(await openNotes(stranger, boardId)).toBeNull();
    expect(await addNote(stranger, { boardId, elementId: "a" }, { body: "x", marks: [] })).toEqual(
      refused("not_found"),
    );
    expect(await editNote(stranger, { boardId, noteId }, { body: "Mine", marks: [] })).toBeNull();
    expect(await removeNote(stranger, { boardId, noteId })).toBeNull();
    // Nor by way of a board of their own.
    const theirs = await drawn("Theirs", stranger);
    expect(await removeNote(stranger, { boardId: theirs, noteId })).toBeNull();
    expect(await noted()).toEqual([expect.objectContaining({ body: "Private" })]);
  });
});
