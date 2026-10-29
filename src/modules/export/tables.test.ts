import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { EXPORTED_TABLES, exportedColumns, LEFT_OUT_TABLES, tableName } from "./tables";

describe("export tables", () => {
  // A table added later fails here until it is exported or said to be left out.
  it("exports every table but sign-in and the job queue", () => {
    const all = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => tableName(table as PgTable))
      .sort();
    const covered = [...EXPORTED_TABLES.map(tableName), ...LEFT_OUT_TABLES].sort();
    expect(covered).toEqual(all);
  });

  it("leaves out bytes, search indexes and fetched page text", () => {
    const columns = EXPORTED_TABLES.flatMap((table) =>
      Object.values(exportedColumns(table)).map((column) => ({
        name: `${tableName(table)}.${column.name}`,
        type: column.getSQLType(),
      })),
    );
    expect(columns.filter(({ type }) => type === "bytea" || type === "tsvector")).toEqual([]);
    expect(columns.map(({ name }) => name)).not.toContain("enrichment_runs.raw_result");
    expect(columns.map(({ name }) => name)).toContain("files.sha256");
  });
});
