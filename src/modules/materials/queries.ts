import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contacts,
  files,
  materials,
  materialSendRecipients,
  materialSends,
  materialVersions,
  organizations,
  type MaterialType,
} from "@/db/schema";
import type { MATERIAL_SORTS, VersionRef } from "./schema";

const ownedBy = (ownerId: string) => eq(materials.ownerId, ownerId);

const SORT_BY = {
  name: sql`lower(${materials.name})`,
  type: sql`${materials.type}`,
  updated: sql`${materials.updatedAt}`,
};

// The label of the version added last, which is the one sent from now on. The
// table is named in full: a select from one table leaves it off its columns.
const currentLabel = sql<string | null>`(
  select v.label from material_versions v
  where v.material_id = "materials"."id"
  order by v.created_at desc, v.id desc
  limit 1
)`;

export async function listMaterials(
  ownerId: string,
  options: {
    q?: string;
    type?: MaterialType;
    sort?: (typeof MATERIAL_SORTS)[number];
    dir?: "asc" | "desc";
    offset?: number;
    limit?: number;
  } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const q = options.q?.trim();
  const direction = options.dir === "desc" ? sql`desc` : sql`asc`;
  const matching = and(
    ownedBy(ownerId),
    options.type ? eq(materials.type, options.type) : undefined,
    q
      ? sql`${materials.name} ilike ${`%${q.replace(/[\\%_]/g, "\\$&")}%`}`
      : undefined,
  );

  const [rows, total] = await Promise.all([
    db
      .select({
        id: materials.id,
        name: materials.name,
        type: materials.type,
        updatedAt: materials.updatedAt,
        currentLabel,
      })
      .from(materials)
      .where(matching)
      // The name and id keep pages stable whatever leads.
      .orderBy(
        sql`${SORT_BY[options.sort ?? "name"]} ${direction}`,
        sql`lower(${materials.name})`,
        asc(materials.id),
      )
      .limit(limit + 1)
      .offset(options.offset ?? 0),
    db.$count(materials, matching),
  ]);

  return {
    rows: rows.slice(0, limit),
    hasMore: rows.length > limit,
    total,
  };
}

export type MaterialListRow = Awaited<ReturnType<typeof listMaterials>>["rows"][number];

// A material with its versions, the newest first. Never a file's bytes.
export async function getMaterial(ownerId: string, id: string) {
  const [row] = await db
    .select(getTableColumns(materials))
    .from(materials)
    .where(and(ownedBy(ownerId), eq(materials.id, id)));
  if (!row) return null;

  const versions = await db
    .select({
      id: materialVersions.id,
      label: materialVersions.label,
      url: materialVersions.url,
      title: materialVersions.title,
      createdAt: materialVersions.createdAt,
      size: files.size,
      contentType: files.contentType,
      // A version that has been sent is kept.
      sends: sql<number>`(
        select count(*)::int from material_sends s where s.version_id = ${materialVersions.id}
      )`,
    })
    .from(materialVersions)
    .leftJoin(files, eq(files.id, materialVersions.fileId))
    .where(eq(materialVersions.materialId, id))
    .orderBy(desc(materialVersions.createdAt), desc(materialVersions.id));

  return { ...row, versions };
}

export const MAX_LISTED_SENDS = 100;

// The latest sends of a material, newest first, with who each went to.
export async function listMaterialSends(ownerId: string, materialId: string) {
  const sends = await db
    .select({
      id: materialSends.id,
      sentAt: materialSends.sentAt,
      channel: materialSends.channel,
      status: materialSends.status,
      note: materialSends.note,
      versionLabel: materialVersions.label,
      organizationId: materialSends.organizationId,
      organizationName: organizations.name,
    })
    .from(materialSends)
    .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
    .leftJoin(organizations, eq(organizations.id, materialSends.organizationId))
    .where(
      and(eq(materialSends.ownerId, ownerId), eq(materialVersions.materialId, materialId)),
    )
    // A time is typed to the minute, so sends in one minute go by when they were logged.
    .orderBy(desc(materialSends.sentAt), desc(materialSends.createdAt), desc(materialSends.id))
    .limit(MAX_LISTED_SENDS);

  const recipients =
    sends.length === 0
      ? []
      : await db
          .select({
            sendId: materialSendRecipients.sendId,
            id: contacts.id,
            name: contacts.fullName,
          })
          .from(materialSendRecipients)
          .innerJoin(contacts, eq(contacts.id, materialSendRecipients.contactId))
          .where(
            and(
              eq(materialSendRecipients.ownerId, ownerId),
              inArray(
                materialSendRecipients.sendId,
                sends.map(({ id }) => id),
              ),
            ),
          )
          .orderBy(asc(contacts.fullName));

  return sends.map((send) => ({
    ...send,
    contacts: recipients
      .filter(({ sendId }) => sendId === send.id)
      .map(({ id, name }) => ({ id, name })),
  }));
}

export type MaterialSendRow = Awaited<ReturnType<typeof listMaterialSends>>[number];

// What a send can be of: each material that has a version, by name, with its
// versions newest first so the first is the current one.
export async function listSendable(ownerId: string) {
  const rows = await db
    .select({
      materialId: materials.id,
      name: materials.name,
      versionId: materialVersions.id,
      label: materialVersions.label,
    })
    .from(materials)
    .innerJoin(materialVersions, eq(materialVersions.materialId, materials.id))
    .where(ownedBy(ownerId))
    .orderBy(
      sql`lower(${materials.name})`,
      asc(materials.id),
      desc(materialVersions.createdAt),
      desc(materialVersions.id),
    );

  const sendable: { id: string; name: string; versions: { id: string; label: string }[] }[] =
    [];
  for (const row of rows) {
    if (sendable.at(-1)?.id !== row.materialId) {
      sendable.push({ id: row.materialId, name: row.name, versions: [] });
    }
    sendable.at(-1)!.versions.push({ id: row.versionId, label: row.label });
  }
  return sendable;
}

export type Sendable = Awaited<ReturnType<typeof listSendable>>;

export type Material = NonNullable<Awaited<ReturnType<typeof getMaterial>>>;
export type MaterialVersion = Material["versions"][number];

// Found by material and version together, so an id from another material gives nothing.
export async function getVersionFile(
  ownerId: string,
  { materialId, versionId }: VersionRef,
) {
  const [file] = await db
    .select({
      title: materialVersions.title,
      contentType: files.contentType,
      bytes: files.bytes,
    })
    .from(materialVersions)
    .innerJoin(files, eq(files.id, materialVersions.fileId))
    .where(
      and(
        eq(materialVersions.ownerId, ownerId),
        eq(materialVersions.materialId, materialId),
        eq(materialVersions.id, versionId),
      ),
    );
  return file ?? null;
}
