import { z } from "zod";
import type { TASK_PRIORITIES } from "@/db/schema/tasks";

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type PriorityColors = Record<TaskPriority, string>;

export const DEFAULT_PRIORITY_COLORS: PriorityColors = {
  low: "#94a3b8",
  normal: "#3b82f6",
  high: "#e5484d",
};

export const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a colour like #22C55E")
  .transform((value) => value.toLowerCase());

export function priorityColors(
  row: {
    taskColorLow: string | null;
    taskColorNormal: string | null;
    taskColorHigh: string | null;
  } | null,
): PriorityColors {
  return {
    low: row?.taskColorLow ?? DEFAULT_PRIORITY_COLORS.low,
    normal: row?.taskColorNormal ?? DEFAULT_PRIORITY_COLORS.normal,
    high: row?.taskColorHigh ?? DEFAULT_PRIORITY_COLORS.high,
  };
}

// Black or white text, whichever reads better on the tag (WCAG relative luminance).
export function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
