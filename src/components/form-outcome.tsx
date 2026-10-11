import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";

export function FormOutcome({ state }: { state: RecordFormState }) {
  if (!state) return null;
  return (
    <div className="grid gap-2">
      <FormMessage state={state} />
      {state.links && (
        <ul className="grid gap-1 text-sm">
          {state.links.map((link) => (
            <li key={link.href}>
              {/* A new tab, so checking the existing record does not discard the form. */}
              <Link href={link.href} target="_blank" className="underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormButtons({
  state,
  pending,
  submitLabel,
  cancelHref,
}: {
  state: RecordFormState;
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
      {/* After the main button, so pressing Enter in a field never confirms a duplicate. */}
      {state?.canConfirm && (
        <Button
          type="submit"
          name="confirmSimilar"
          value="yes"
          variant="outline"
          disabled={pending}
        >
          Create anyway
        </Button>
      )}
      <ButtonLink href={cancelHref} variant="ghost">
        Cancel
      </ButtonLink>
    </div>
  );
}
