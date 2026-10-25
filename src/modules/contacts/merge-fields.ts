// What a merge of two people compares, shared by the merge view and the service.
// Location is chosen as one, so a city never ends up with another person's country.
export const MERGE_FIELDS = [
  { key: "firstName", label: "First name", columns: ["firstName"] },
  { key: "lastName", label: "Last name", columns: ["lastName"] },
  { key: "jobTitle", label: "Title", columns: ["jobTitle"] },
  { key: "department", label: "Department", columns: ["department"] },
  { key: "phone", label: "Phone", columns: ["phoneE164"] },
  { key: "location", label: "Location", columns: ["city", "region", "country"] },
  { key: "timezone", label: "Time zone", columns: ["timezone"] },
  {
    key: "preferredChannel",
    label: "Preferred channel",
    columns: ["preferredChannel"],
  },
  { key: "status", label: "Status", columns: ["status"] },
  {
    key: "relationshipType",
    label: "Relationship",
    columns: ["relationshipType"],
  },
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];
type MergeColumn = MergeField["columns"][number];
export type MergeSide = "keep" | "other";
type Values = Record<MergeColumn, string | null>;

export const fieldValue = (field: MergeField, person: Values) =>
  field.columns
    .map((column) => person[column])
    .filter(Boolean)
    .join(", ");

export const fieldDiffers = (field: MergeField, keep: Values, other: Values) =>
  field.columns.some((column) => (keep[column] ?? "") !== (other[column] ?? ""));

// The kept person's value, unless they have none and the other has one. Shown as
// the choice made, and what the merge does for a field nobody chose.
export function sideFor(
  keepEmpty: boolean,
  otherEmpty: boolean,
  pick: MergeSide | undefined,
): MergeSide {
  if (keepEmpty || otherEmpty) return keepEmpty && !otherEmpty ? "other" : "keep";
  return pick ?? "keep";
}
