import {
  FREQUENCIES,
  parseRule,
  type Frequency,
} from "@/modules/tasks/recurrence";
import { TASK_PRIORITIES } from "@/modules/tasks/schema";

const REPEAT_LABELS: Record<Frequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const taskFormOptions = {
  priorities: TASK_PRIORITIES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
  repeats: FREQUENCIES.map((value) => ({ value, label: REPEAT_LABELS[value] })),
};

export function repeatLabel(rule: string) {
  const { frequency, interval } = parseRule(rule);
  const label = REPEAT_LABELS[frequency];
  return interval === 1 ? label : `${label}, every ${interval}`;
}
