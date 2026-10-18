import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { files, materials, materialVersions } from "@/db/schema";
import { listAudit } from "@/modules/audit/service";
import { MAX_STORED_BYTES } from "@/modules/files/service";
import { addFile, removeAttachment } from "@/modules/workflows/attachments";
import { createBoard, saveScene } from "@/modules/workflows/boards";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { sceneSave } from "@/modules/workflows/schema";
import { docx, pdf } from "@/test/files";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { getMaterial, getVersionFile, listMaterials } from "./queries";
import {
  MATERIAL_UPLOADS_PER_MINUTE,
  materialInput,
  MAX_MATERIAL_VERSIONS,
  MAX_MATERIALS,
  newMaterialInput,
  versionLink,
  versionRef,
} from "./schema";
import {
  addVersionFile,
  addVersionLink,
  createMaterial,
  deleteMaterial,
  removeVersion,
  updateMaterial,
} from "./service";

const form = { name: "Rate card", type: "quote", description: "", url: "", label: "" };
const newInput = (override: Partial<typeof form> = {}) =>
  newMaterialInput.parse({ ...form, ...override });
const refused = (reason: string) => ({ ok: false, reason });

describe("material input", () => {
  it("stores an empty description and link as nothing", () => {
    expect(newInput()).toEqual({
      name: "Rate card",
      type: "quote",
      description: null,
      url: null,
      label: null,
    });
    expect(
      newInput({ url: " https://drive.example/rates ", label: " v2 " }),
    ).toMatchObject({ url: "https://drive.example/rates", label: "v2" });
  });

  it.each([
    ["no name", { name: " " }],
    ["a name over 200 characters", { name: "x".repeat(201) }],
    ["an unknown type", { type: "invoice" }],
    ["a description over 2,000 characters", { description: "x".repeat(2001) }],
    ["a link that is a script", { url: "javascript:alert(1)" }],
    ["a link to a file on this computer", { url: "file:///etc/passwd" }],
    ["an unexpected field", { ownerId: "x" }],
  ])("rejects %s", (_label, override) => {
    expect(newMaterialInput.safeParse({ ...form, ...override }).success).toBe(false);
  });

  it("takes a version as a label and a web address, and nothing else", () => {
    expect(versionLink.parse({ label: " v1 ", url: "https://a.test" })).toEqual({
      label: "v1",
      url: "https://a.test",
    });
    expect(versionLink.safeParse({ label: "", url: "https://a.test" }).success).toBe(
      false,
    );
    expect(
      versionLink.safeParse({ label: "x".repeat(101), url: "https://a.test" }).success,
    ).toBe(false);
    expect(
      versionLink.safeParse({ label: "v1", url: "https://a.test", fileId: "x" }).success,
    ).toBe(false);
    const materialId = crypto.randomUUID();
    expect(versionRef.safeParse({ materialId, versionId: "1" }).success).toBe(false);
  });

  it("takes no link when a material is edited", () => {
    expect(materialInput.safeParse(form).success).toBe(false);
  });
});

describe("materials", () => {
  let ownerId: string;
  let materialId: string;

  const make = async (override: Partial<typeof form> = {}, owner = ownerId) => {
    const created = await createMaterial(owner, newInput(override));
    if (!created.ok) throw new Error(created.reason);
    return created.id;
  };
  const upload = (name: string, bytes: Buffer, id = materialId, label = "v1") =>
    addVersionFile(ownerId, id, { label, name, bytes });
  const stored = () =>
    db.select({ id: files.id }).from(files).where(eq(files.ownerId, ownerId));
  const versions = async (id = materialId) => (await getMaterial(ownerId, id))!.versions;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    materialId = await make();
  });

  it("is created with an optional first link, which is called v1 unless named", async () => {
    expect(await versions()).toEqual([]);
    const linked = await make({ name: "Deck", url: "https://canva.example/deck" });
    expect(await versions(linked)).toMatchObject([
      { label: "v1", url: "https://canva.example/deck", title: null, size: null },
    ]);
    const named = await make({ name: "Portfolio", url: "https://a.test", label: "2026" });
    expect((await versions(named))[0].label).toBe("2026");

    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({ action: "material.create", entityId: named });
  });

  it("refuses a name the owner already has, whatever its case", async () => {
    expect(await createMaterial(ownerId, newInput({ name: "rate CARD" }))).toEqual(
      refused("name_taken"),
    );
    const other = await make({ name: "Deck" });
    const renamed = materialInput.parse({ name: "Rate Card", type: "deck", description: "" });
    expect(await updateMaterial(ownerId, other, renamed)).toEqual(refused("name_taken"));
    // Its own name, in another case, is no clash.
    expect((await updateMaterial(ownerId, materialId, renamed)).ok).toBe(true);
    // Another owner may use the same name.
    const stranger = await createTestOwner("stranger@example.com");
    expect((await createMaterial(stranger, newInput())).ok).toBe(true);
  });

  it("is edited and deleted by its owner only", async () => {
    const stranger = await createTestOwner("stranger@example.com");
    const edit = materialInput.parse({
      name: "Rates 2027",
      type: "proposal",
      description: "Sent with every quote",
    });
    expect(await updateMaterial(stranger, materialId, edit)).toEqual(refused("not_found"));
    expect(await deleteMaterial(stranger, materialId)).toBe(false);

    expect(await updateMaterial(ownerId, materialId, edit)).toEqual({
      ok: true,
      id: materialId,
    });
    expect(await getMaterial(ownerId, materialId)).toMatchObject(edit);
    expect(await getMaterial(stranger, materialId)).toBeNull();

    expect(await deleteMaterial(ownerId, materialId)).toBe(true);
    expect(await getMaterial(ownerId, materialId)).toBeNull();
    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry).toMatchObject({
      action: "material.delete",
      before: { name: "Rates 2027" },
    });
  });

  it(`holds at most ${MAX_MATERIALS} materials`, async () => {
    await db.insert(materials).values(
      Array.from({ length: MAX_MATERIALS - 1 }, (_, index) => ({
        ownerId,
        name: `Material ${index}`,
        type: "other" as const,
      })),
    );
    expect(await createMaterial(ownerId, newInput({ name: "One too many" }))).toEqual(
      refused("limit"),
    );
  });

  it("keeps versions newest first, as links and files read by their bytes", async () => {
    expect(
      await addVersionLink(ownerId, materialId, { label: "v1", url: "https://a.test/1" }),
    ).toMatchObject({ ok: true });
    const added = await upload("Rate card 2027.pdf", pdf("rates"), materialId, "v2");
    expect(added).toMatchObject({ ok: true });
    expect((await upload("rates.docx", docx(), materialId, "v3")).ok).toBe(true);

    expect(await versions()).toMatchObject([
      {
        label: "v3",
        url: null,
        title: "rates.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      { label: "v2", title: "Rate card 2027.pdf", contentType: "application/pdf" },
      { label: "v1", url: "https://a.test/1", contentType: null },
    ]);
    const [row] = (await listMaterials(ownerId)).rows;
    expect(row).toMatchObject({ name: "Rate card", currentLabel: "v3" });

    if (!added.ok) throw new Error("not added");
    const file = await getVersionFile(ownerId, { materialId, versionId: added.id });
    expect(file).toMatchObject({ title: "Rate card 2027.pdf", contentType: "application/pdf" });
    expect(file?.bytes.equals(pdf("rates"))).toBe(true);
    // A version is found only under its own material and owner.
    const other = await make({ name: "Deck" });
    expect(await getVersionFile(ownerId, { materialId: other, versionId: added.id })).toBeNull();
    const stranger = await createTestOwner("stranger@example.com");
    expect(await getVersionFile(stranger, { materialId, versionId: added.id })).toBeNull();
  });

  it("refuses a file by its bytes, its size, the owner's room and the rate", async () => {
    expect(await upload("notes.txt", Buffer.from("plain text"))).toEqual(refused("kind"));
    expect(await upload("page.pdf", Buffer.from("<svg onload=alert(1)>"))).toEqual(
      refused("kind"),
    );
    expect(
      await upload("big.pdf", Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)])),
    ).toEqual(refused("too_large"));

    await db.insert(files).values({
      ownerId,
      contentType: "application/pdf",
      size: MAX_STORED_BYTES - 10,
      sha256: "filler",
      bytes: Buffer.alloc(1),
    });
    expect(await upload("more.pdf", pdf("does not fit"))).toEqual(refused("full"));
    await db.delete(files).where(eq(files.sha256, "filler"));

    // Links do not count towards the rate, only files.
    await db.insert(materialVersions).values(
      Array.from({ length: MATERIAL_UPLOADS_PER_MINUTE }, (_, index) => ({
        ownerId,
        materialId,
        label: `link ${index}`,
        url: "https://a.test",
      })),
    );
    const first = await upload("one.pdf", pdf("one"));
    expect(first.ok).toBe(true);

    const [{ fileId }] = await db
      .select({ fileId: materialVersions.fileId })
      .from(materialVersions)
      .where(eq(materialVersions.label, "v1"));
    await db.delete(materialVersions).where(eq(materialVersions.materialId, materialId));
    await db.insert(materialVersions).values(
      Array.from({ length: MATERIAL_UPLOADS_PER_MINUTE }, (_, index) => ({
        ownerId,
        materialId,
        label: `file ${index}`,
        fileId,
      })),
    );
    expect(await upload("two.pdf", pdf("two"))).toEqual(refused("rate"));
  });

  it(`holds at most ${MAX_MATERIAL_VERSIONS} versions, and only on the owner's material`, async () => {
    const stranger = await createTestOwner("stranger@example.com");
    expect(
      await addVersionLink(stranger, materialId, { label: "v1", url: "https://a.test" }),
    ).toEqual(refused("not_found"));
    expect(
      await addVersionFile(stranger, materialId, { label: "v1", name: "a.pdf", bytes: pdf() }),
    ).toEqual(refused("not_found"));

    await db.insert(materialVersions).values(
      Array.from({ length: MAX_MATERIAL_VERSIONS }, (_, index) => ({
        ownerId,
        materialId,
        label: `v${index}`,
        url: "https://a.test",
      })),
    );
    expect(
      await addVersionLink(ownerId, materialId, { label: "v51", url: "https://a.test" }),
    ).toEqual(refused("limit"));
  });

  it("stores the same bytes once and frees a file when nothing points at it", async () => {
    const other = await make({ name: "Deck" });
    const first = await upload("rates.pdf", pdf("same"));
    await upload("copy.pdf", pdf("same"), other);
    expect(await stored()).toHaveLength(1);
    if (!first.ok) throw new Error("not added");

    expect(await removeVersion(ownerId, { materialId: other, versionId: first.id })).toEqual(
      refused("not_found"),
    );
    expect(await removeVersion(ownerId, { materialId, versionId: first.id })).toEqual({
      ok: true,
    });
    expect(await stored()).toHaveLength(1);
    expect(await deleteMaterial(ownerId, other)).toBe(true);
    expect(await stored()).toHaveLength(0);

    const [entry] = (await listAudit(ownerId, { limit: 1 })).rows;
    expect(entry.action).toBe("material.delete");
  });

  it("keeps a file a whiteboard box also carries, and the other way round", async () => {
    const board = await createBoard(ownerId, { name: "Onboarding", description: null });
    if (!board.ok) throw new Error(board.reason);
    await saveScene(
      ownerId,
      board.id,
      sceneSave.parse({
        version: 1,
        elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 }],
      }),
    );
    const box = { boardId: board.id, elementId: "a" };
    const onBox = await addFile(ownerId, box, { name: "brief.pdf", bytes: pdf("shared") });
    if (!onBox.ok) throw new Error(onBox.reason);
    expect((await upload("brief.pdf", pdf("shared"))).ok).toBe(true);
    expect(await stored()).toHaveLength(1);

    await removeAttachment(ownerId, { boardId: board.id, attachmentId: onBox.attachments[0].id });
    expect(await stored()).toHaveLength(1);
    expect(await deleteMaterial(ownerId, materialId)).toBe(true);
    expect(await stored()).toHaveLength(0);
  });

  it("lists by name, type and last change, a page at a time", async () => {
    const deck = await make({ name: "Agency deck", type: "deck" });
    await make({ name: "Zebra proposal", type: "proposal" });
    await addVersionLink(ownerId, deck, { label: "v1", url: "https://a.test" });

    const names = async (options: Parameters<typeof listMaterials>[1]) =>
      (await listMaterials(ownerId, options)).rows.map((row) => row.name);
    expect(await names({})).toEqual(["Agency deck", "Rate card", "Zebra proposal"]);
    expect(await names({ dir: "desc" })).toEqual(["Zebra proposal", "Rate card", "Agency deck"]);
    expect(await names({ type: "deck" })).toEqual(["Agency deck"]);
    expect(await names({ q: "PROP" })).toEqual(["Zebra proposal"]);
    expect(await names({ q: "%" })).toEqual([]);
    // A new version marks its material changed.
    expect((await names({ sort: "updated", dir: "desc" }))[0]).toBe("Agency deck");

    const page = await listMaterials(ownerId, { limit: 2 });
    expect(page).toMatchObject({ hasMore: true, total: 3 });
    expect((await listMaterials(ownerId, { limit: 2, offset: 2 })).hasMore).toBe(false);

    const stranger = await createTestOwner("stranger@example.com");
    expect((await listMaterials(stranger)).total).toBe(0);
  });
});
