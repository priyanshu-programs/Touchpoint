import { formatDate } from "@/lib/time";
import type { CustomFieldType } from "./schema";

// A stored custom value as Details shows it; nothing for a field left empty.
export function formatCustomValue(
  type: CustomFieldType,
  value: string | number | undefined,
) {
  if (value === undefined) return null;
  if (type === "number") return new Intl.NumberFormat("en").format(Number(value));
  if (type === "date") return formatDate(String(value));
  return String(value);
}
