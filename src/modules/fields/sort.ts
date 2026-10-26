import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { customKey, type CustomFieldType } from "./schema";

export type CustomSort = { key: string; type: CustomFieldType };

// How a list's address names a custom column to sort by: the key as a layout holds it.
export const CUSTOM_SORT = /^custom\.[a-z0-9_]{1,60}$/;

// The address is the browser's, so only one of the owner's own fields counts.
export const customSortOf = <Field extends CustomSort>(
  sort: string | undefined,
  fields: Field[],
) => fields.find(({ key }) => customKey(key) === sort);

// The key reaches SQL only as a bound parameter. Numbers are kept as JSON numbers
// and dates as ISO text, so each sorts in its own order.
export function customSortBy(custom: AnyColumn, { key, type }: CustomSort): SQL {
  if (type === "number") return sql`(${custom}->>${key}::text)::numeric`;
  if (type === "date") return sql`${custom}->>${key}::text`;
  return sql`lower(${custom}->>${key}::text)`;
}

// The direction a custom column takes when first chosen: text A to Z, numbers and dates largest first.
export const customFirstDirection = (type: CustomFieldType) =>
  type === "number" || type === "date" ? ("desc" as const) : ("asc" as const);
