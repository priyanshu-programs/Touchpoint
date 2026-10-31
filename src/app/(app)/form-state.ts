import type { z } from "zod";

export type RecordFormState = {
  ok: boolean;
  message: string;
  // Echoed back so a rejected form keeps what was typed.
  values?: Record<string, string>;
  links?: { href: string; label: string }[];
  // The people a refused contact may already be, for forms that can use one of them.
  people?: { id: string; name: string }[];
  canConfirm?: boolean;
  // What will happen once the owner presses again, worked out on the server.
  confirm?: string;
} | null;

export function invalid(
  error: z.ZodError,
  values: Record<string, string>,
): RecordFormState {
  return { ok: false, message: error.issues[0].message, values };
}
