import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  contacts,
  files,
  organizations,
  workflowAttachments,
} from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { deleteContact } from "@/modules/contacts/service";
import { MAX_STORED_BYTES } from "@/modules/files/service";
import { deleteOrganization } from "@/modules/organizations/service";
import { docx, pdf } from "@/test/files";
import { createTestOwner, resetDatabase } from "@/test/owner";
import {
  addFile,
  addLink,
  getAttachmentFile,
  openAttachments,
  removeAttachment,
} from "./attachments";
import { createBoard, deleteBoard, saveScene, startBoard } from "./boards";
import { MAX_FILE_BYTES } from "./drawing";
import {
  attachmentRef,
  boxLink,
  boxRef,
  MAX_BOARD_ATTACHMENTS,
  sceneSave,
  UPLOADS_PER_MINUTE,
} from "./schema";

const box = (id: string) => ({ id, type: "rectangle", x: 0, y: 0, width: 100, height: 60 });
const link = (url: string, title = "") => boxLink.parse({ title, url });
const refused = (reason: string) => ({ ok: false, reason });

describe("boxLink", () => {
  it("keeps a web address and stores a missing name as nothing", () => {
    expect(link(" https://example.com/brief ")).toEqual({
      title: null,
      url: "https://example.com/brief",
    });
    expect(link("http://example.com", " Brief ").title).toBe("Brief");
  });

  it.each([
    ["a script", { title: "", url: "javascript:alert(1)" }],
    ["a file on this computer", { title: "", url: "file:///etc/passwd" }],
    ["a path", { title: "", url: "/people" }],
    ["no address", { title: "Brief", url: "" }],
    ["a name over 200 characters", { title: "x".repeat(201), url: "https://a.test" }],
    ["an unexpected property", { title: "", url: "https://a.test", fileId: "x" }],
  ])("rejects %s", (_label, value) => {
    expect(boxLink.safeParse(value).success).toBe(false);
  });

  it("names a box by a board's id and an element, and nothing else", () => {
    const boardId = crypto.randomUUID();
    expect(boxRef.safeParse({ boardId, elementId: "a" }).success).toBe(true);
    expect(boxRef.safeParse({ boardId: "1", elementId: "a" }).success).toBe(false);
    expect(boxRef.safeParse({ boardId, elementId: "" }).success).toBe(false);
    expect(boxRef.safeParse({ boardId, elementId: "a", ownerId: "x" }).success).toBe(
      false,
    );
    expect(attachmentRef.safeParse({ boardId, attachmentId: "1" }).success).toBe(false);
  });
});

describe("links and files on a box", () => {
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

  const carried = async (id = boardId) => {
    const attachments = await openAttachments(ownerId, id);
    if (!attachments) throw new Error("no board");
    return attachments;
  };
  const stored = () =>
    db.select({ id: files.id, size: files.size }).from(files).where(eq(files.ownerId, ownerId));
  const upload = (elementId: string, name: string, bytes: Buffer, id = boardId) =>
    addFile(ownerId, { boardId: id, elementId }, { name, bytes });

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    boardId = await drawn("Onboarding");
  });

  it("puts a link on a box, named by its site when it is given no name", async () => {
    const a = { boardId, elementId: "a" };
    expect(await addLink(ownerId, a, link("https://docs.example.com/brief"))).toEqual({
      ok: true,
      attachments: [
        expect.objectContaining({
          elementId: "a",
          title: "docs.example.com",
          url: "https://docs.example.com/brief",
          size: null,
          contentType: null,
        }),
      ],
    });
    await addLink(ownerId, a, link("https://example.com/quote", "Quote"));
    expect((await carried()).map(({ title }) => title)).toEqual([
      "docs.example.com",
      "Quote",
    ]);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.attachment_add",
      entityId: boardId,
      after: { title: "Quote", url: "https://example.com/quote" },
    });
  });

  it("puts something only on a box of the drawing as stored", async () => {
    const on = (elementId: string) =>
      addLink(ownerId, { boardId, elementId }, link("https://example.com"));
    expect(await on("line")).toEqual(refused("no_box"));
    expect(await on("not-drawn")).toEqual(refused("no_box"));
    expect(await upload("line", "brief.pdf", pdf())).toEqual(refused("no_box"));
    expect(
      await addLink(
        ownerId,
        { boardId: crypto.randomUUID(), elementId: "a" },
        link("https://example.com"),
      ),
    ).toEqual(refused("not_found"));
    expect(await carried()).toEqual([]);
  });

  it("keeps a file under its name, with its size and the kind read from it", async () => {
    const bytes = pdf("the brief");
    const result = await upload("a", "  Brief\\v2/final\u0000.pdf ", bytes);
    expect(result).toEqual({
      ok: true,
      attachments: [
        expect.objectContaining({
          elementId: "a",
          title: "Brief v2 final .pdf",
          url: null,
          size: bytes.length,
          contentType: "application/pdf",
        }),
      ],
    });
    const [{ id: attachmentId }] = await carried();
    const file = await getAttachmentFile(ownerId, { boardId, attachmentId });
    expect(file).toMatchObject({ title: "Brief v2 final .pdf", contentType: "application/pdf" });
    expect(file?.bytes.equals(bytes)).toBe(true);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.attachment_add",
      after: { title: "Brief v2 final .pdf", contentType: "application/pdf", size: bytes.length },
    });
  });

  it("goes by the bytes and not by the name", async () => {
    expect(await upload("a", "notes.pdf", Buffer.from("only text"))).toEqual(
      refused("kind"),
    );
    expect(await upload("a", "page.png", Buffer.from("<script>alert(1)</script>"))).toEqual(
      refused("kind"),
    );
    const word = await upload("a", "contract.pdf", docx());
    expect(word.ok && word.attachments[0].contentType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(await upload("a", "", pdf())).toMatchObject({
      attachments: [{}, { title: "Untitled file" }],
    });
  });

  it("refuses a file over the size one may be", async () => {
    const large = Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]);
    expect(await upload("a", "large.pdf", large)).toEqual(refused("too_large"));
    expect(await stored()).toEqual([]);
  });

  it("stores the same bytes once, wherever they are put", async () => {
    const other = await drawn("Offboarding");
    await upload("a", "brief.pdf", pdf("same"));
    await upload("b", "brief again.pdf", pdf("same"));
    await upload("a", "brief.pdf", pdf("same"), other);
    await upload("a", "another.pdf", pdf("different"));
    expect(await stored()).toHaveLength(2);
    expect(await carried()).toHaveLength(3);
  });

  it("deletes a file when the last thing pointing at it is removed", async () => {
    await upload("a", "brief.pdf", pdf());
    await upload("b", "brief.pdf", pdf());
    await addLink(ownerId, { boardId, elementId: "a" }, link("https://example.com"));
    const [first, second, third] = await carried();

    expect(
      await removeAttachment(ownerId, { boardId, attachmentId: first.id }),
    ).toHaveLength(2);
    expect(await stored()).toHaveLength(1);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      action: "workflow.attachment_remove",
      before: { title: "brief.pdf", url: null },
    });

    await removeAttachment(ownerId, { boardId, attachmentId: second.id });
    expect(await stored()).toEqual([]);
    expect(await carried()).toEqual([third]);
    expect(
      await removeAttachment(ownerId, { boardId, attachmentId: second.id }),
    ).toBeNull();
  });

  it("stops at the most a whiteboard can carry", async () => {
    await db.insert(workflowAttachments).values(
      Array.from({ length: MAX_BOARD_ATTACHMENTS }, (_, index) => ({
        ownerId,
        boardId,
        elementId: "a",
        title: `Link ${index}`,
        url: "https://example.com",
      })),
    );
    expect(
      await addLink(ownerId, { boardId, elementId: "b" }, link("https://example.com")),
    ).toEqual(refused("limit"));
    expect(await upload("b", "brief.pdf", pdf())).toEqual(refused("limit"));
  });

  it("stops at the room an owner's files may take, and counts a file once", async () => {
    const small = pdf("small");
    await upload("a", "small.pdf", small);
    await db.insert(files).values({
      ownerId,
      contentType: "application/pdf",
      size: MAX_STORED_BYTES - small.length - 10,
      sha256: "filler",
      bytes: Buffer.alloc(1),
    });
    expect(await upload("a", "more.pdf", pdf("a file that does not fit"))).toEqual(
      refused("full"),
    );
    // Bytes already stored take no more room.
    expect((await upload("b", "small again.pdf", small)).ok).toBe(true);
    expect((await upload("b", "tiny.pdf", pdf())).ok).toBe(false);
  });

  it("stops at the uploads a minute may hold", async () => {
    const [{ id: fileId }] = await db
      .insert(files)
      .values({
        ownerId,
        contentType: "application/pdf",
        size: 1,
        sha256: "seeded",
        bytes: Buffer.alloc(1),
      })
      .returning({ id: files.id });
    const other = await drawn("Offboarding");
    await db.insert(workflowAttachments).values(
      Array.from({ length: UPLOADS_PER_MINUTE }, (_, index) => ({
        ownerId,
        boardId: other,
        elementId: "a",
        title: `File ${index}`,
        fileId,
      })),
    );
    expect(await upload("a", "brief.pdf", pdf())).toEqual(refused("rate"));
    // A link is not an upload.
    expect(
      (await addLink(ownerId, { boardId, elementId: "a" }, link("https://example.com")))
        .ok,
    ).toBe(true);
  });

  it("drops what a deleted box carried when the whiteboard is next opened", async () => {
    await upload("a", "brief.pdf", pdf("a"));
    await upload("b", "quote.pdf", pdf("b"));
    await addLink(ownerId, { boardId, elementId: "b" }, link("https://example.com"));

    // The box `b` is deleted on the whiteboard and the drawing saved.
    await saveScene(ownerId, boardId, sceneSave.parse({ version: 2, elements: [box("a")] }));
    // Nothing goes with the save: an undo could still bring the box back.
    expect(
      await db
        .select({ id: workflowAttachments.id })
        .from(workflowAttachments)
        .where(eq(workflowAttachments.boardId, boardId)),
    ).toHaveLength(3);
    expect(await stored()).toHaveLength(2);

    expect((await carried()).map(({ title }) => title)).toEqual(["brief.pdf"]);
    expect(await stored()).toHaveLength(1);
    expect((await listAudit(ownerId)).rows[0]).toMatchObject({
      actor: "system",
      action: "workflow.attachments_dropped",
      before: expect.arrayContaining(["quote.pdf", "example.com"]),
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

    beforeEach(async () => {
      [{ id: organizationId }] = await db
        .insert(organizations)
        .values({ ownerId, name: "Acme" })
        .returning({ id: organizations.id });
      [{ id: contactId }] = await db
        .insert(contacts)
        .values({ ownerId, firstName: "Priya", lastName: "Sharma" })
        .returning({ id: contacts.id });
      await upload("a", "brief.pdf", pdf());
      await addLink(ownerId, { boardId, elementId: "b" }, link("https://example.com"));
    });

    it("copies what the boxes carry without storing a file again", async () => {
      // What a box no longer in the drawing carried is not copied.
      await db
        .insert(workflowAttachments)
        .values({ ownerId, boardId, elementId: "gone", title: "Old", url: "https://a.test" });
      const copy = await start({ organizationId });

      expect(await carried(copy)).toEqual([
        expect.objectContaining({ elementId: "a", title: "brief.pdf", url: null }),
        expect.objectContaining({ elementId: "b", title: "example.com" }),
      ]);
      expect(await stored()).toHaveLength(1);
    });

    it("keeps a copy and its workflow apart", async () => {
      const copy = await start({ organizationId });
      const sibling = await start({ contactId });
      const [file] = await carried(copy);

      await removeAttachment(ownerId, { boardId: copy, attachmentId: file.id });
      await upload("b", "notes.pdf", pdf("notes"), copy);
      expect((await carried(copy)).map(({ title }) => title)).toEqual([
        "example.com",
        "notes.pdf",
      ]);
      expect((await carried()).map(({ title }) => title)).toEqual([
        "brief.pdf",
        "example.com",
      ]);
      expect((await carried(sibling)).map(({ title }) => title)).toEqual([
        "brief.pdf",
        "example.com",
      ]);

      // The workflow goes; the file its copies still point at stays.
      await deleteBoard(ownerId, boardId);
      expect(await carried(sibling)).toHaveLength(2);
      expect(await stored()).toHaveLength(2);
    });

    it("frees a file when its last board goes, by itself or with its record", async () => {
      const onCompany = await start({ organizationId });
      await start({ contactId });
      await upload("a", "company only.pdf", pdf("company"), onCompany);
      expect(await stored()).toHaveLength(2);

      await deleteOrganization(ownerId, organizationId);
      expect(await stored()).toHaveLength(1);
      await deleteBoard(ownerId, boardId);
      expect(await stored()).toHaveLength(1);
      await deleteContact(ownerId, contactId);
      expect(await stored()).toEqual([]);
    });
  });

  it("keeps another owner away from a board and what it carries", async () => {
    await upload("a", "brief.pdf", pdf());
    const [{ id: attachmentId }] = await carried();
    const stranger = await createTestOwner("stranger@example.com");
    const a = { boardId, elementId: "a" };

    expect(await openAttachments(stranger, boardId)).toBeNull();
    expect(await addLink(stranger, a, link("https://example.com"))).toEqual(
      refused("not_found"),
    );
    expect(await addFile(stranger, a, { name: "x.pdf", bytes: pdf() })).toEqual(
      refused("not_found"),
    );
    expect(await removeAttachment(stranger, { boardId, attachmentId })).toBeNull();
    expect(await getAttachmentFile(stranger, { boardId, attachmentId })).toBeNull();
    // Nor by way of a board of their own.
    const theirs = await drawn("Theirs", stranger);
    expect(
      await getAttachmentFile(stranger, { boardId: theirs, attachmentId }),
    ).toBeNull();
    expect(await carried()).toHaveLength(1);

    // The same bytes are a file of their own for another owner.
    await addFile(stranger, { boardId: theirs, elementId: "a" }, { name: "x.pdf", bytes: pdf() });
    expect(await db.select({ id: files.id }).from(files)).toHaveLength(2);
  });
});
