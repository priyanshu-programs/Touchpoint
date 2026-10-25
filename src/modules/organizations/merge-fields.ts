// What a merge of two companies compares, shared by the merge view and the service.
// A domain goes with its website and a city with its country, so neither is mixed.
export const MERGE_FIELDS = [
  { key: "name", label: "Name", columns: ["name"] },
  { key: "website", label: "Website", columns: ["domain", "website"] },
  { key: "phone", label: "Phone", columns: ["phone"] },
  { key: "email", label: "Email", columns: ["email"] },
  { key: "industry", label: "Industry", columns: ["industry"] },
  { key: "description", label: "Description", columns: ["description"] },
  { key: "location", label: "Location", columns: ["city", "region", "country"] },
  { key: "status", label: "Status", columns: ["status"] },
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];
type MergeColumn = MergeField["columns"][number];
type Values = Record<MergeColumn, string | null>;

export const fieldValue = (field: MergeField, company: Values) =>
  field.columns
    .map((column) => company[column])
    .filter(Boolean)
    .join(", ");

export const fieldDiffers = (field: MergeField, keep: Values, other: Values) =>
  field.columns.some((column) => (keep[column] ?? "") !== (other[column] ?? ""));
