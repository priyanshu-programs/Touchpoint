import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { files, materials, materialVersions, type MaterialType } from "@/db/schema";
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
    })
    .from(materialVersions)
    .leftJoin(files, eq(files.id, materialVersions.fileId))
    .where(eq(materialVersions.materialId, id))
    .orderBy(desc(materialVersions.createdAt), desc(materialVersions.id));

  return { ...row, versions };
}

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
