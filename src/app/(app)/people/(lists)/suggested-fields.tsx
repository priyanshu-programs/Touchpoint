"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { addSuggestedFieldAction } from "../fields/actions";
import { FieldsSection } from "./fields-section";

// Fields this app offers ready-made. One click adds a field as a custom one,
// after which it is no longer offered.
export function SuggestedFields({
  entityType,
  fields,
}: {
  entityType: string;
  fields: { key: string; label: string; detail: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addSuggestedFieldAction.bind(null, entityType),
    null,
  );

  return (
    <FieldsSection
      title="Suggested fields"
      note={`${fields.length} · one click to add`}
    >
      <ul className="grid gap-1 px-1">
        {fields.map((field) => (
          <li key={field.key} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 break-words">
              {field.label}
              <span className="text-muted-foreground"> · {field.detail}</span>
            </span>
            <form action={formAction}>
              <input type="hidden" name="key" value={field.key} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label={`Add ${field.label}`}
              >
                <Plus aria-hidden />
                Add
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {state && !state.ok && (
        <div className="px-1 pt-2">
          <FormMessage state={state} />
        </div>
      )}
    </FieldsSection>
  );
}
