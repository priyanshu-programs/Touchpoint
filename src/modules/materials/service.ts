import { and, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { materials, materialVersions } from "@/db/schema";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { fileType } from "@/modules/files/sniff";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import {
  MATERIAL_UPLOADS_PER_MINUTE,
  MAX_MATERIAL_VERSIONS,
  MAX_MATERIALS,
  MAX_VERSION_TITLE,
  type MaterialInput,
  type NewMaterialInput,
  type VersionLink,
  type VersionRef,
} from "./schema";

export type MaterialResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "name_taken" | "limit" };

export type VersionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_found" | "limit" | "too_large" | "kind" | "full" | "rate";
    };

const count = sql<number>`count(*)::int`;

// Held to the end of the transaction, so the limit and the unique name cannot
// be passed by two changes at once.
const lockMaterials = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`materials:${ownerId}`}))`);

async function lockMaterial(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(materials)
    .where(and(eq(materials.ownerId, ownerId), eq(materials.id, id)))
    .for("update");
  return row;
}

// The name is citext, so this compares without regard to case.
async function nameTaken(tx: Tx, ownerId: string, name: string, except?: string) {
  const [row] = await tx
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(
        eq(materials.ownerId, ownerId),
        eq(materials.name, name),
        except ? ne(materials.id, except) : undefined,
      ),
    );
  return Boolean(row);
}

const snapshot = (row: MaterialInput) => ({
  name: row.name,
  type: row.type,
  description: row.description,
});

export async function createMaterial(
  ownerId: string,
  { url, label, ...input }: NewMaterialInput,
): Promise<MaterialResult> {
  return db.transaction(async (tx) => {
    await lockMaterials(tx, ownerId);
    const owned = await tx.$count(materials, eq(materials.ownerId, ownerId));
    if (owned >= MAX_MATERIALS) return { ok: false, reason: "limit" };
    if (await nameTaken(tx, ownerId, input.name)) {
      return { ok: false, reason: "name_taken" };
    }

    const [row] = await tx
      .insert(materials)
      .values({ ownerId, ...input })
      .returning({ id: materials.id });
    const first = url ? { label: label ?? "v1", url } : null;
    if (first) {
      await tx
        .insert(materialVersions)
        .values({ ownerId, materialId: row.id, ...first });
    }
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.create",
      entityType: "material",
      entityId: row.id,
      after: { ...snapshot(input), version: first },
    });
    return { ok: true, id: row.id };
  });
}

export async function updateMaterial(
  ownerId: string,
  id: string,
  input: MaterialInput,
): Promise<MaterialResult> {
  return db.transaction(async (tx) => {
    await lockMaterials(tx, ownerId);
    const before = await lockMaterial(tx, ownerId, id);
    if (!before) return { ok: false, reason: "not_found" };
    if (await nameTaken(tx, ownerId, input.name, id)) {
      return { ok: false, reason: "name_taken" };
    }

    await tx.update(materials).set(input).where(eq(materials.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.update",
      entityType: "material",
      entityId: id,
      before: snapshot(before),
      after: snapshot(input),
    });
    return { ok: true, id };
  });
}

// Its versions go with it, and a stored file nothing else points at.
export async function deleteMaterial(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockMaterial(tx, ownerId, id);
    if (!before) return false;

    const [{ held }] = await tx
      .select({ held: count })
      .from(materialVersions)
      .where(and(eq(materialVersions.materialId, id), isNotNull(materialVersions.fileId)));
    await tx.delete(materials).where(eq(materials.id, id));
    if (held > 0) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.delete",
      entityType: "material",
      entityId: id,
      before: snapshot(before),
    });
    return true;
  });
}

// The material is held for the length of the change, so its limit on versions
// cannot be passed by two changes at once. A new version also marks it updated.
async function versionRefusal(tx: Tx, ownerId: string, materialId: string) {
  if (!(await lockMaterial(tx, ownerId, materialId))) return "not_found";
  const versions = await tx.$count(
    materialVersions,
    eq(materialVersions.materialId, materialId),
  );
  return versions >= MAX_MATERIAL_VERSIONS ? "limit" : null;
}

const touch = (tx: Tx, materialId: string) =>
  tx.update(materials).set({ updatedAt: new Date() }).where(eq(materials.id, materialId));

export async function addVersionLink(
  ownerId: string,
  materialId: string,
  link: VersionLink,
): Promise<VersionResult> {
  return db.transaction(async (tx) => {
    const reason = await versionRefusal(tx, ownerId, materialId);
    if (reason) return { ok: false, reason };

    const [row] = await tx
      .insert(materialVersions)
      .values({ ownerId, materialId, ...link })
      .returning({ id: materialVersions.id });
    await touch(tx, materialId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_add",
      entityType: "material",
      entityId: materialId,
      after: link,
    });
    return { ok: true, id: row.id };
  });
}

// A file goes by the name it was uploaded under, without what a name cannot hold.
const fileTitle = (name: string) =>
  name
    .replace(/[\p{Cc}\\/]+/gu, " ")
    .trim()
    .slice(0, MAX_VERSION_TITLE) || "Untitled file";

// The kind of file is read from its bytes; the name is only what it is called.
export async function addVersionFile(
  ownerId: string,
  materialId: string,
  { label, name, bytes }: { label: string; name: string; bytes: Buffer },
): Promise<VersionResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = fileType(bytes);
  if (!contentType) return { ok: false, reason: "kind" };

  return db.transaction(async (tx) => {
    const reason = await versionRefusal(tx, ownerId, materialId);
    if (reason) return { ok: false, reason };

    const [{ recent }] = await tx
      .select({ recent: count })
      .from(materialVersions)
      .where(
        and(
          eq(materialVersions.ownerId, ownerId),
          isNotNull(materialVersions.fileId),
          gt(materialVersions.createdAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (recent >= MATERIAL_UPLOADS_PER_MINUTE) return { ok: false, reason: "rate" };

    const fileId = await storeFile(tx, ownerId, bytes, contentType);
    if (!fileId) return { ok: false, reason: "full" };

    const title = fileTitle(name);
    const [row] = await tx
      .insert(materialVersions)
      .values({ ownerId, materialId, label, fileId, title })
      .returning({ id: materialVersions.id });
    await touch(tx, materialId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_add",
      entityType: "material",
      entityId: materialId,
      after: { label, title, contentType, size: bytes.length },
    });
    return { ok: true, id: row.id };
  });
}

export async function removeVersion(
  ownerId: string,
  { materialId, versionId }: VersionRef,
) {
  return db.transaction(async (tx) => {
    if (!(await lockMaterial(tx, ownerId, materialId))) return false;
    const [gone] = await tx
      .delete(materialVersions)
      .where(
        and(
          eq(materialVersions.materialId, materialId),
          eq(materialVersions.id, versionId),
        ),
      )
      .returning({
        label: materialVersions.label,
        url: materialVersions.url,
        title: materialVersions.title,
        fileId: materialVersions.fileId,
      });
    if (!gone) return false;
    if (gone.fileId) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_remove",
      entityType: "material",
      entityId: materialId,
      before: { label: gone.label, url: gone.url, title: gone.title },
    });
    return true;
  });
}
