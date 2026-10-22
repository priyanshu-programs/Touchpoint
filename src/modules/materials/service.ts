import { and, eq, exists, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  auditLog,
  contacts,
  materials,
  materialSendRecipients,
  materialSends,
  materialVersions,
  organizations,
  type SendStatus,
} from "@/db/schema";
import { fromLocalInput } from "@/lib/time";
import { audit } from "@/modules/audit/service";
import { dropUnusedFiles, storeFile } from "@/modules/files/service";
import { fileType } from "@/modules/files/sniff";
import { ownerTimezone } from "@/modules/settings/service";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import {
  MATERIAL_UPLOADS_PER_MINUTE,
  MAX_MATERIAL_VERSIONS,
  MAX_MATERIALS,
  MAX_VERSION_TITLE,
  SENDS_PER_MINUTE,
  type MaterialInput,
  type NewMaterialInput,
  type SendInput,
  type VersionEdit,
  type VersionLink,
  type VersionRef,
} from "./schema";

export type MaterialResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "name_taken" | "limit" };

export type CreateResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "name_taken" | "limit" | "too_large" | "kind" | "full" | "rate";
    };

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

export type UploadedFile = { name: string; bytes: Buffer };

// The kind is read from the bytes alone, before any change is begun.
function sniff(
  bytes: Buffer,
): { ok: true; contentType: string } | { ok: false; reason: "too_large" | "kind" } {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = fileType(bytes);
  return contentType ? { ok: true, contentType } : { ok: false, reason: "kind" };
}

// A file goes by the name it was uploaded under, without what a name cannot hold.
const fileTitle = (name: string) =>
  name
    .replace(/[\p{Cc}\\/]+/gu, " ")
    .trim()
    .slice(0, MAX_VERSION_TITLE) || "Untitled file";

// Uploads are counted from the audit log, where each stored file is recorded
// with its kind: a file put in place of another leaves no new version to count.
async function uploadsInLastMinute(tx: Tx, ownerId: string) {
  const [{ recent }] = await tx
    .select({ recent: count })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.ownerId, ownerId),
        eq(auditLog.entityType, "material"),
        gt(auditLog.createdAt, sql`now() - interval '1 minute'`),
        sql`jsonb_path_exists(${auditLog.after}, '$.**.contentType')`,
      ),
    );
  return recent;
}

async function storeVersionFile(
  tx: Tx,
  ownerId: string,
  { name, bytes }: UploadedFile,
  contentType: string,
): Promise<{ ok: true; fileId: string; title: string } | { ok: false; reason: "rate" | "full" }> {
  if ((await uploadsInLastMinute(tx, ownerId)) >= MATERIAL_UPLOADS_PER_MINUTE) {
    return { ok: false, reason: "rate" };
  }
  const fileId = await storeFile(tx, ownerId, bytes, contentType);
  if (!fileId) return { ok: false, reason: "full" };
  return { ok: true, fileId, title: fileTitle(name) };
}

const fileAudit = (
  label: string,
  { title }: { title: string },
  { contentType }: { contentType: string },
  { bytes }: UploadedFile,
) => ({ label, title, contentType, size: bytes.length });

// A new material may start with a link or an uploaded file as its first version.
// With a file, the material is made only if the file is kept.
export async function createMaterial(
  ownerId: string,
  { url, label, ...input }: NewMaterialInput,
  file?: UploadedFile,
): Promise<CreateResult> {
  const sniffed = file ? sniff(file.bytes) : null;
  if (sniffed && !sniffed.ok) return sniffed;
  const versionLabel = label ?? "v1";

  return db.transaction(async (tx) => {
    await lockMaterials(tx, ownerId);
    const owned = await tx.$count(materials, eq(materials.ownerId, ownerId));
    if (owned >= MAX_MATERIALS) return { ok: false, reason: "limit" };
    if (await nameTaken(tx, ownerId, input.name)) {
      return { ok: false, reason: "name_taken" };
    }

    // Nothing is written before this, so a refusal leaves no material behind.
    const stored =
      file && sniffed ? await storeVersionFile(tx, ownerId, file, sniffed.contentType) : null;
    if (stored && !stored.ok) return stored;

    const [row] = await tx
      .insert(materials)
      .values({ ownerId, ...input })
      .returning({ id: materials.id });
    const first = stored
      ? { label: versionLabel, fileId: stored.fileId, title: stored.title }
      : url
        ? { label: versionLabel, url }
        : null;
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
      after: {
        ...snapshot(input),
        version:
          stored && file && sniffed
            ? fileAudit(versionLabel, stored, sniffed, file)
            : (first ?? null),
      },
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

// The kind of file is read from its bytes; the name is only what it is called.
export async function addVersionFile(
  ownerId: string,
  materialId: string,
  { label, ...file }: UploadedFile & { label: string },
): Promise<VersionResult> {
  const sniffed = sniff(file.bytes);
  if (!sniffed.ok) return sniffed;

  return db.transaction(async (tx) => {
    const reason = await versionRefusal(tx, ownerId, materialId);
    if (reason) return { ok: false, reason };
    const stored = await storeVersionFile(tx, ownerId, file, sniffed.contentType);
    if (!stored.ok) return stored;

    const [row] = await tx
      .insert(materialVersions)
      .values({ ownerId, materialId, label, fileId: stored.fileId, title: stored.title })
      .returning({ id: materialVersions.id });
    await touch(tx, materialId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_add",
      entityType: "material",
      entityId: materialId,
      after: fileAudit(label, stored, sniffed, file),
    });
    return { ok: true, id: row.id };
  });
}

export type VersionEditResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "sent" | "too_large" | "kind" | "full" | "rate" };

// The version under its material, held for the change, and whether it was sent.
async function lockVersion(tx: Tx, ownerId: string, { materialId, versionId }: VersionRef) {
  if (!(await lockMaterial(tx, ownerId, materialId))) return null;
  const [row] = await tx
    .select({
      label: materialVersions.label,
      url: materialVersions.url,
      title: materialVersions.title,
      fileId: materialVersions.fileId,
    })
    .from(materialVersions)
    .where(and(eq(materialVersions.materialId, materialId), eq(materialVersions.id, versionId)));
  if (!row) return null;
  const sends = await tx.$count(materialSends, eq(materialSends.versionId, versionId));
  return { ...row, sent: sends > 0 };
}

const versionSnapshot = ({ label, url, title }: { label: string; url: string | null; title: string | null }) => ({
  label,
  url,
  title,
});

// A sent version keeps what it holds, so its sends still say what went out; its
// label can always change. A link given in place of a file lets the file go.
export async function updateVersion(
  ownerId: string,
  ref: VersionRef,
  { label, url }: VersionEdit,
): Promise<VersionEditResult> {
  return db.transaction(async (tx) => {
    const before = await lockVersion(tx, ownerId, ref);
    if (!before) return { ok: false, reason: "not_found" };
    const relink = url !== null && url !== before.url;
    if (relink && before.sent) return { ok: false, reason: "sent" };

    await tx
      .update(materialVersions)
      .set(relink ? { label, url, fileId: null, title: null } : { label })
      .where(eq(materialVersions.id, ref.versionId));
    if (relink && before.fileId) await dropUnusedFiles(tx, ownerId);
    await touch(tx, ref.materialId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_update",
      entityType: "material",
      entityId: ref.materialId,
      before: versionSnapshot(before),
      after: relink ? { label, url } : { label },
    });
    return { ok: true };
  });
}

// A new file in place of what an unsent version held, a link or another file.
export async function replaceVersionFile(
  ownerId: string,
  ref: VersionRef,
  { label, ...file }: UploadedFile & { label: string },
): Promise<VersionEditResult> {
  const sniffed = sniff(file.bytes);
  if (!sniffed.ok) return sniffed;

  return db.transaction(async (tx) => {
    const before = await lockVersion(tx, ownerId, ref);
    if (!before) return { ok: false, reason: "not_found" };
    if (before.sent) return { ok: false, reason: "sent" };
    const stored = await storeVersionFile(tx, ownerId, file, sniffed.contentType);
    if (!stored.ok) return stored;

    await tx
      .update(materialVersions)
      .set({ label, url: null, fileId: stored.fileId, title: stored.title })
      .where(eq(materialVersions.id, ref.versionId));
    if (before.fileId && before.fileId !== stored.fileId) await dropUnusedFiles(tx, ownerId);
    await touch(tx, ref.materialId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_update",
      entityType: "material",
      entityId: ref.materialId,
      before: versionSnapshot(before),
      after: fileAudit(label, stored, sniffed, file),
    });
    return { ok: true };
  });
}

// A version that has been sent is kept, so its sends still say what went out.
export async function removeVersion(
  ownerId: string,
  { materialId, versionId }: VersionRef,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "sent" }> {
  return db.transaction(async (tx) => {
    if (!(await lockMaterial(tx, ownerId, materialId))) {
      return { ok: false, reason: "not_found" };
    }
    const sends = await tx.$count(materialSends, eq(materialSends.versionId, versionId));
    if (sends > 0) return { ok: false, reason: "sent" };
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
    if (!gone) return { ok: false, reason: "not_found" };
    if (gone.fileId) await dropUnusedFiles(tx, ownerId);
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.version_remove",
      entityType: "material",
      entityId: materialId,
      before: { label: gone.label, url: gone.url, title: gone.title },
    });
    return { ok: true };
  });
}

export type SendResult =
  | { ok: true; id: string; materialId: string }
  | {
      ok: false;
      reason: "unknown_version" | "unknown_contact" | "unknown_organization" | "rate";
    };

async function unknownRecipient(tx: Tx, ownerId: string, input: SendInput) {
  const found = await tx.$count(
    contacts,
    and(eq(contacts.ownerId, ownerId), inArray(contacts.id, input.contactIds)),
  );
  if (found !== input.contactIds.length) return "unknown_contact" as const;
  if (input.organizationId) {
    const found = await tx.$count(
      organizations,
      and(
        eq(organizations.ownerId, ownerId),
        eq(organizations.id, input.organizationId),
      ),
    );
    if (!found) return "unknown_organization" as const;
  }
  return null;
}

// Sending a newer version of a material means the older one is no longer what its
// readers are looking at: an earlier send of it that is still open (sent or viewed)
// becomes superseded once everyone it went to has had a newer one. The material is
// held, so a version cannot be added or removed under the send.
export async function logSend(ownerId: string, input: SendInput): Promise<SendResult> {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({
        id: materialVersions.id,
        materialId: materialVersions.materialId,
        label: materialVersions.label,
      })
      .from(materialVersions)
      .where(
        and(eq(materialVersions.ownerId, ownerId), eq(materialVersions.id, input.versionId)),
      );
    if (!version || !(await lockMaterial(tx, ownerId, version.materialId))) {
      return { ok: false, reason: "unknown_version" };
    }
    const problem = await unknownRecipient(tx, ownerId, input);
    if (problem) return { ok: false, reason: problem };

    const recent = await tx.$count(
      materialSends,
      and(
        eq(materialSends.ownerId, ownerId),
        gt(materialSends.createdAt, sql`now() - interval '1 minute'`),
      ),
    );
    if (recent >= SENDS_PER_MINUTE) return { ok: false, reason: "rate" };

    const timezone = await ownerTimezone(tx, ownerId);
    const [row] = await tx
      .insert(materialSends)
      .values({
        ownerId,
        versionId: version.id,
        sentAt: fromLocalInput(input.sentAt, timezone),
        channel: input.channel,
        organizationId: input.organizationId,
        note: input.note,
      })
      .returning({ id: materialSends.id });
    await tx
      .insert(materialSendRecipients)
      .values(input.contactIds.map((contactId) => ({ sendId: row.id, contactId, ownerId })));

    // Older in the order the Versions card shows, compared against the stored row,
    // which keeps microsecond precision that a JS Date would lose.
    const olderVersions = tx
      .select({ id: materialVersions.id })
      .from(materialVersions)
      .where(
        and(
          eq(materialVersions.materialId, version.materialId),
          sql`(${materialVersions.createdAt}, ${materialVersions.id}) < (
            select created_at, id from material_versions where id = ${version.id}
          )`,
        ),
      );
    const toThesePeople = tx
      .select({ one: sql`1` })
      .from(materialSendRecipients)
      .where(
        and(
          eq(materialSendRecipients.sendId, materialSends.id),
          inArray(materialSendRecipients.contactId, input.contactIds),
        ),
      );
    // A send stays open while anyone it went to has had no newer version, by this
    // send or an earlier one.
    const someoneWaiting = sql`select 1 from material_send_recipients r
      join material_versions v on v.id = ${materialSends.versionId}
      where r.send_id = ${materialSends.id}
        and not exists (
          select 1 from material_send_recipients later_r
          join material_sends later on later.id = later_r.send_id
          join material_versions later_v on later_v.id = later.version_id
          where later_r.contact_id = r.contact_id
            and later_v.material_id = v.material_id
            and (later_v.created_at, later_v.id) > (v.created_at, v.id)
        )`;
    const superseded = await tx
      .update(materialSends)
      .set({ status: "superseded" })
      .where(
        and(
          eq(materialSends.ownerId, ownerId),
          inArray(materialSends.status, ["sent", "viewed"]),
          inArray(materialSends.versionId, olderVersions),
          exists(toThesePeople),
          sql`not exists (${someoneWaiting})`,
        ),
      )
      .returning({ id: materialSends.id });

    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.send",
      entityType: "material",
      entityId: version.materialId,
      after: {
        sendId: row.id,
        version: version.label,
        sentAt: input.sentAt,
        channel: input.channel,
        contactIds: input.contactIds,
        organizationId: input.organizationId,
        note: input.note,
        superseded: superseded.map(({ id }) => id),
      },
    });
    return { ok: true, id: row.id, materialId: version.materialId };
  });
}

async function lockSend(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select({
      status: materialSends.status,
      materialId: materialVersions.materialId,
    })
    .from(materialSends)
    .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
    .where(and(eq(materialSends.ownerId, ownerId), eq(materialSends.id, id)))
    .for("update", { of: materialSends });
  return row;
}

export async function setSendStatus(ownerId: string, id: string, status: SendStatus) {
  return db.transaction(async (tx) => {
    const before = await lockSend(tx, ownerId, id);
    if (!before) return false;
    if (before.status === status) return true;
    await tx.update(materialSends).set({ status }).where(eq(materialSends.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.send_status",
      entityType: "material",
      entityId: before.materialId,
      before: { sendId: id, status: before.status },
      after: { sendId: id, status },
    });
    return true;
  });
}

// A send logged by mistake is removed outright; the audit row keeps that it was.
export async function removeSend(ownerId: string, id: string) {
  return db.transaction(async (tx) => {
    const before = await lockSend(tx, ownerId, id);
    if (!before) return null;
    await tx.delete(materialSends).where(eq(materialSends.id, id));
    await audit(tx, {
      ownerId,
      actor: "user",
      action: "material.send_remove",
      entityType: "material",
      entityId: before.materialId,
      before: { sendId: id, status: before.status },
    });
    return { materialId: before.materialId };
  });
}
