import type { FormState } from "@/app/(app)/settings/actions";

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={
        state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"
      }
    >
      {state.message}
    </p>
  );
}
