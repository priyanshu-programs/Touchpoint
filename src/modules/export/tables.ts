import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

// Every table of the owner's data, in data.json's order: records first, what hangs
// off them after, the audit log last.
export const EXPORTED_TABLES: readonly PgTable[] = [
  schema.settings,
  schema.companyStatuses,
  schema.customFieldDefs,
  schema.fieldLayouts,
  schema.tags,
  schema.organizations,
  schema.organizationTags,
  schema.organizationLogos,
  schema.contacts,
  schema.contactOrganizations,
  schema.contactEmails,
  schema.contactLinks,
  schema.contactTags,
  schema.contactPhotos,
  schema.enrichmentRuns,
  schema.fieldProvenance,
  schema.profileSearches,
  schema.tasks,
  schema.reminders,
  schema.activities,
  schema.activityContacts,
  schema.files,
  schema.workflowBoards,
  schema.workflowAttachments,
  schema.workflowNotes,
  schema.workflowPictures,
  schema.brainstormBoards,
  schema.brainstormElements,
  schema.brainstormPictures,
  schema.materials,
  schema.materialVersions,
  schema.materialSends,
  schema.materialSendRecipients,
  schema.invoices,
  schema.invoiceLines,
  schema.invoiceAdjustments,
  schema.payments,
  schema.paymentAllocations,
  schema.auditLog,
];

// Sign-in (passwords, sessions, tokens) and the app's own bookkeeping. The owner's
// name and email are written at the top of data.json instead of the user row.
export const LEFT_OUT_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
  "jobs",
] as const;

// A file's or a picture's bytes, and the search index built from the other columns.
const LEFT_OUT_TYPES = new Set(["bytea", "tsvector"]);
// The text of a stranger's web page, kept from a website read; not the owner's data.
const LEFT_OUT_COLUMNS = new Set(["enrichment_runs.raw_result"]);

export const tableName = (table: PgTable) => getTableConfig(table).name;

export function exportedColumns(table: PgTable) {
  const name = tableName(table);
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(
      ([, column]) =>
        !LEFT_OUT_TYPES.has(column.getSQLType()) &&
        !LEFT_OUT_COLUMNS.has(`${name}.${column.name}`),
    ),
  ) as Record<string, PgColumn>;
}

// The key's columns in its own order, by their names in the table's columns: a
// composite key holds copies of them, not the same objects.
function primaryKeyOf(table: PgTable) {
  const config = getTableConfig(table);
  const key = config.primaryKeys[0]?.columns ?? config.columns.filter((column) => column.primary);
  const columns = Object.entries(getTableColumns(table) as Record<string, PgColumn>);
  return key.map(({ name }) => columns.find(([, column]) => column.name === name)!);
}

export const PAGE_ROWS = 1000;

// The owner's rows of one table, a page at a time in primary-key order, so a board of
// 100,000 elements is never held at once.
export async function* tableRows(db: NodePgDatabase, table: PgTable, ownerId: string) {
  const all = getTableColumns(table) as Record<string, PgColumn>;
  const columns = exportedColumns(table);
  const keyNames = primaryKeyOf(table).map(([name]) => name);
  const key = primaryKeyOf(table).map(([, column]) => column);
  let after: unknown[] | null = null;
  for (;;) {
    const rows: Record<string, unknown>[] = await db
      .select(columns)
      .from(table)
      .where(
        and(
          eq(all.ownerId, ownerId),
          after
            ? sql`(${sql.join(key, sql`, `)}) > (${sql.join(
                after.map((value) => sql`${value}`),
                sql`, `,
              )})`
            : undefined,
        ),
      )
      .orderBy(...key.map((column) => asc(column)))
      .limit(PAGE_ROWS);
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    after = keyNames.map((name) => last[name]);
    yield rows;
    if (rows.length < PAGE_ROWS) return;
  }
}
