import { Badge } from "@/components/ui/badge";
import {
  textOn,
  type PriorityColors,
  type TaskPriority,
} from "@/modules/settings/priority-colors";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

// Colours come only from the owner's settings, each a checked #rrggbb.
export function PriorityTag({
  priority,
  colors,
}: {
  // A task's stored priority, held to the three by the table's check.
  priority: string;
  colors: PriorityColors;
}) {
  const level = priority as TaskPriority;
  const color = colors[level];
  return (
    <Badge
      data-priority={priority}
      style={{ backgroundColor: color, color: textOn(color) }}
    >
      {PRIORITY_LABELS[level]}
    </Badge>
  );
}
